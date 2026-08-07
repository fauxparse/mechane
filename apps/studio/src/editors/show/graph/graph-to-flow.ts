// Maps a Show graph as the API returns it (issue #38) onto React Flow's
// node and edge shapes (issue #40).
//
// This is the whole of the vendor boundary for graph *shape*: React Flow's
// `Node`/`Edge` types stop here, and everything upstream of this module
// speaks the domain's language. That matters more than usual because two of
// the mappings are not one-to-one:
//
//   - **Containment.** The domain says "this node's parent is that Flow"
//     (`parentId`, #29). React Flow says "this node is a child of that
//     node, and its position is relative to it" (also `parentId` — spelled
//     `parentNode` before v12, so the shared name is coincidence). Same fact,
//     and the domain's stored positions for Flow-local nodes are already
//     relative to their Flow — but React Flow additionally needs the parent
//     to be *sized*, and to appear before its children in the array. Both
//     are handled below; neither is a thing the domain should know.
//
//   - **Wiring targets.** A wiring edge lands on a Scene *Variable*
//     (`targetPath[0]`), which will be a per-Variable handle once nodes get
//     their real visual language (#35). The placeholder node has one input
//     handle, so the Variable is carried in `data` and not yet addressed as
//     a handle — the edge is drawn to the node, not to the row.
//
// Node bodies are deliberately placeholders: issue #40 is about the camera,
// and the visual language is #35's.
//
// The input types are structural rather than named (see `MappableNode`),
// because the editor now holds the *domain* graph so that commands can act on
// it (#41), while a freshly fetched graph is still the wire shape. Both draw
// the same way, and neither has to be converted just to be rendered.
import { isEdgeKind, isNodeKind } from "@mechane/domain";
import type { EdgeKind, NodeKind, Position } from "@mechane/domain";
import type { Edge, Node } from "@xyflow/react";

/**
 * A node as this mapper needs it described. Structural rather than named, so
 * both the wire shape (`@mechane/graphql-schema`'s `ShowGraphNode`, where
 * every kind's fields are present and nullable) and the domain's
 * discriminated union (where a Source simply has no `defaultSceneId`) satisfy
 * it. The editor holds the domain shape (#41); a freshly fetched graph is
 * still the wire shape until ./api-graph converts it.
 */
export interface MappableNode {
  id: string;
  kind: string;
  name: string;
  position: Position;
  parentId?: string | null;
  defaultSceneId?: string | null;
  variables?: readonly { id: string; name: string }[] | null;
  perConnection?: boolean | null;
  pairingCode?: string | null;
}

export interface MappableEdge {
  id: string;
  kind: string;
  sourceId: string;
  targetId: string;
  targetPath?: readonly string[] | null;
  /** The wire shape resolves this for the client; the domain reads it off the path. */
  targetVariableId?: string | null;
}

/**
 * Node geometry. React Flow measures rendered nodes itself, but a Flow's size
 * has to be known *before* first render (an unsized parent clips its children
 * to nothing), so the node bodies commit to a fixed width (#35 — no user
 * resizing, values live in the inspector) and this module does the arithmetic.
 */
export const NODE_WIDTH = 208;

/** A node with no rows: the header alone. */
export const NODE_HEIGHT = 56;

/** One Variable row on a Scene (#35 puts each Variable's handle on its row). */
export const VARIABLE_ROW_HEIGHT = 24;

/** Padding below the last Variable row. */
const VARIABLE_LIST_PADDING = 8;

/** Breathing room between a Flow's boundary and the nodes inside it. */
const FLOW_PADDING = 24;

/** Height of a Flow's own title row, above the area its children sit in. */
const FLOW_HEADER_HEIGHT = 36;

/** First safe child position: below the header and inside the Flow padding. */
export const FLOW_CONTENT_ORIGIN: Position = {
  x: FLOW_PADDING,
  y: FLOW_HEADER_HEIGHT + FLOW_PADDING,
};

// `type`, not `interface`: React Flow v12 constrains node and edge data to
// `Record<string, unknown>`, which an interface does not satisfy structurally
// (interfaces have no implicit index signature).
export type ShowNodeData = {
  kind: NodeKind;
  name: string;
  /** Scene Variables, in graph order. Empty for every other kind. */
  variables: { id: string; name: string }[];
  /** The Scene a Flow enters by default (#23), if one has been chosen. */
  defaultSceneId: string | null;
  /**
   * Variables with a producer wired into them. #35's dangling-input marker is
   * the complement: a Variable *not* in here has nothing feeding it, which is
   * the one state that breaks the Show at performance time and is otherwise
   * invisible.
   */
  wiredVariableIds: string[];
  /** Whether this Flow is the default-Scene owner of a Scene in the graph. */
  isDefaultScene: boolean;
  /** Nodes inside this Flow — how a Flow says "3 scenes" (#35, #44). */
  childCount: number;
  /** Devices only: one instance per connection rather than one shared (#45). */
  perConnection: boolean;
  /**
   * Devices only: whether a Flow or top-level Scene drives this Device.
   * An undriven Device is legal and expected — the director will often
   * place the projector before the Flow exists — so it reads as a warning
   * on the node, never as a blocked publish (#45).
   */
  driven: boolean;
  /**
   * Devices only: the Show-level pairing code, or null while the server
   * hasn't minted one — the state a Device is in between appearing on the
   * canvas and the first save coming back (#45).
   */
  pairingCode: string | null;
  /** Local canvas view state; never persisted or commanded (#44). */
  collapsed?: boolean;
};

export type ShowEdgeData = {
  kind: EdgeKind;
  /** The Scene Variable a wiring edge feeds — the head of its target path. */
  targetVariableId: string | null;
};

/**
 * Handle ids. A wiring edge lands on the Variable's *own* handle (#35), which
 * is why the Variable id is the handle id — React Flow addresses handles by
 * string, and the Variable already has a stable one. The two constants below
 * are for everything that isn't a Variable.
 */
export const OUTPUT_HANDLE = "out";
export const INPUT_HANDLE = "in";

export type ShowFlowNode = Node<ShowNodeData>;
export type ShowFlowEdge = Edge<ShowEdgeData>;

/**
 * A node's position in canvas coordinates. A Flow-local node's `position` is
 * relative to its Flow (see the containment note above); v11 precomputed the
 * absolute one as `positionAbsolute`, and v12 keeps it on the *internal* node
 * instead. Since containment is this module's mapping, it resolves it too,
 * which also keeps the callers that hold a plain node array pure.
 *
 * Nesting is one level deep by construction: only a Flow can be a parent, and
 * a Flow is always top-level (#29).
 */
export function absolutePosition(
  node: ShowFlowNode,
  byId: ReadonlyMap<string, ShowFlowNode>,
): Position {
  const parent = node.parentId ? byId.get(node.parentId) : undefined;
  if (!parent) return node.position;
  return { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y };
}

/** The React Flow node type every kind currently renders as. */
export const PLACEHOLDER_NODE_TYPE = "showNode";

/** The React Flow node type a Flow renders as: a sized container. */
export const FLOW_NODE_TYPE = "showFlow";
export const SMART_SMOOTH_STEP_EDGE_TYPE = "smartSmoothStep";

function nodeKindOf(node: MappableNode): NodeKind {
  // The API types `kind` as a string, so this is the boundary that turns it
  // back into the closed set the domain defines. A graph that gained a kind
  // this build doesn't know about should say so, not render as a blank box.
  if (!isNodeKind(node.kind)) {
    throw new Error(`Unknown Show graph node kind "${node.kind}" on node "${node.id}".`);
  }
  return node.kind;
}

/**
 * How big a Flow has to be to hold its children. Children keep their stored
 * positions (free-form, #25) — the container grows around them rather than
 * the positions being adjusted to fit a container.
 *
 * A childless Flow still gets one node's worth of room, so an empty Flow
 * reads as an empty container rather than as a collapsed sliver.
 */
/**
 * How tall a node is. Every kind is one header tall except a Scene, which
 * grows a row per Variable — #20 makes Variables named handles, and a handle
 * with nowhere to sit can't be aimed at.
 */
export function nodeHeight(node: MappableNode): number {
  const variables = node.variables?.length ?? 0;
  if (node.kind !== "scene" || variables === 0) return NODE_HEIGHT;
  return NODE_HEIGHT + variables * VARIABLE_ROW_HEIGHT + VARIABLE_LIST_PADDING;
}

export function flowSize(children: readonly MappableNode[]): { width: number; height: number } {
  const right = children.reduce((max, child) => Math.max(max, child.position.x + NODE_WIDTH), 0);
  const bottom = children.reduce(
    (max, child) => Math.max(max, child.position.y + nodeHeight(child)),
    0,
  );
  return {
    width: Math.max(NODE_WIDTH, right) + FLOW_PADDING,
    height: Math.max(FLOW_HEADER_HEIGHT + NODE_HEIGHT, bottom) + FLOW_PADDING,
  };
}

function toFlowNode(
  node: MappableNode,
  children: readonly MappableNode[],
  wiredVariableIds: Set<string>,
  defaultSceneIds: Set<string>,
  drivenDeviceIds: Set<string>,
  collapsed: boolean,
): ShowFlowNode {
  const kind = nodeKindOf(node);
  const isFlow = kind === "flow";
  return {
    id: node.id,
    type: isFlow ? FLOW_NODE_TYPE : PLACEHOLDER_NODE_TYPE,
    position: { x: node.position.x, y: node.position.y },
    // React Flow reads a child's position as relative to its parent, which is
    // already how the domain stores a Flow-local node's position.
    ...(node.parentId ? { parentId: node.parentId } : {}),
    // Every node is sized up front, not just Flows. React Flow measures
    // rendered nodes, but `fitView` on first paint runs *before* the first
    // measurement — an unsized node contributes nothing to the bounds, so
    // opening a Show would frame a graph with some of its nodes off-screen.
    style: isFlow
      ? collapsed
        ? { width: NODE_WIDTH, height: FLOW_HEADER_HEIGHT + FLOW_PADDING }
        : flowSize(children)
      : { width: NODE_WIDTH, height: nodeHeight(node) },
    data: {
      kind,
      name: node.name,
      variables: [...(node.variables ?? [])],
      defaultSceneId: node.defaultSceneId ?? null,
      wiredVariableIds: (node.variables ?? []).reduce<string[]>((ids, variable) => {
        if (wiredVariableIds.has(variable.id)) ids.push(variable.id);
        return ids;
      }, []),
      isDefaultScene: defaultSceneIds.has(node.id),
      childCount: children.length,
      perConnection: node.perConnection ?? false,
      pairingCode: node.pairingCode ?? null,
      driven: drivenDeviceIds.has(node.id),
      ...(isFlow ? { collapsed } : {}),
    },
  };
}

function toFlowEdge(edge: MappableEdge): ShowFlowEdge {
  if (!isEdgeKind(edge.kind)) {
    throw new Error(`Unknown Show graph edge kind "${edge.kind}" on edge "${edge.id}".`);
  }
  const targetVariableId = edge.targetVariableId ?? edge.targetPath?.[0] ?? null;
  return {
    id: edge.id,
    type: SMART_SMOOTH_STEP_EDGE_TYPE,
    source: edge.sourceId,
    target: edge.targetId,
    sourceHandle: OUTPUT_HANDLE,
    // A wiring edge terminates on its Variable's row; the other two kinds have
    // one input to aim at, so they take the node's own handle.
    targetHandle: edge.kind === "wiring" && targetVariableId ? targetVariableId : INPUT_HANDLE,
    data: {
      kind: edge.kind,
      // The wire shape resolves the Variable for the client; the domain shape
      // carries it as the head of the target path (`wiringTargetVariableId`),
      // so read whichever one is there.
      targetVariableId,
    },
  };
}

/**
 * The graph as React Flow wants it. Flows come first: React Flow still
 * requires a parent to appear before its children, and sorting here means
 * no caller has to remember that.
 */
export function graphToFlow(
  graph: { nodes: readonly MappableNode[]; edges: readonly MappableEdge[] } | null | undefined,
  options: { collapsedFlowIds?: ReadonlySet<string> } = {},
): {
  nodes: ShowFlowNode[];
  edges: ShowFlowEdge[];
} {
  if (!graph) return { nodes: [], edges: [] };

  const collapsed = options.collapsedFlowIds ?? new Set<string>();
  const childrenByParent = new Map<string, MappableNode[]>();
  for (const node of graph.nodes) {
    if (!node.parentId) continue;
    const siblings = childrenByParent.get(node.parentId);
    if (siblings) siblings.push(node);
    else childrenByParent.set(node.parentId, [node]);
  }

  const flows: MappableNode[] = [];
  const rest: MappableNode[] = [];
  for (const node of graph.nodes) {
    (node.kind === "flow" ? flows : rest).push(node);
  }

  // Which Variables have a producer, and which Scenes are their Flow's entry
  // point — both are facts about the *graph* that a single node has to display
  // (#35), so they're gathered once here rather than by each node body.
  const wiredVariableIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== "wiring") continue;
    const id = edge.targetVariableId ?? edge.targetPath?.[0];
    if (id) wiredVariableIds.add(id);
  }
  const defaultSceneIds = new Set<string>();
  for (const node of graph.nodes) {
    if (node.defaultSceneId) defaultSceneIds.add(node.defaultSceneId);
  }
  // Which Devices something drives. Same reasoning as the wired-Variable
  // set above: a fact about the graph that one node has to display.
  const drivenDeviceIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind === "device") drivenDeviceIds.add(edge.targetId);
  }

  return {
    nodes: [...flows, ...rest].reduce<ShowFlowNode[]>((nodes, node) => {
      if (!node.parentId || !collapsed.has(node.parentId)) {
        nodes.push(
          toFlowNode(
            node,
            childrenByParent.get(node.id) ?? [],
            wiredVariableIds,
            defaultSceneIds,
            drivenDeviceIds,
            collapsed.has(node.id),
          ),
        );
      }
      return nodes;
    }, []),
    edges: graph.edges.map((edge) => {
      const hiddenTarget = graph.nodes.find((node) => node.id === edge.targetId);
      const flowId = hiddenTarget?.parentId;
      if (edge.kind === "wiring" && flowId && collapsed.has(flowId)) {
        return { ...toFlowEdge(edge), target: flowId, targetHandle: INPUT_HANDLE };
      }
      return toFlowEdge(edge);
    }),
  };
}

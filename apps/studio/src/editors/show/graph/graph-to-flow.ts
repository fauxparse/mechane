// React Flow projection for the Show graph. React Flow types stop here; the
// graph and its derived facts stay in @mechane/domain.
//
// This adapter owns only vendor-shaped nodes and edges, containment ordering,
// geometry, handles, and collapsed Flow projection. The domain fact seam owns
// inherited colors, wired Variables, driven Devices, entry Scenes, and type
// compatibility so other Show Editor surfaces can reuse those answers.
import {
  DEFAULT_FLOW_COLOR,
  deriveShowGraphFacts,
  fieldsForType,
  valueAtPath,
  wiringDiagnostics,
} from "@mechane/domain";
import type {
  Cue,
  EdgeKind,
  EdgeLayout,
  FlowColor,
  GraphEdge,
  GraphNode,
  Position,
  Shape,
  ShowGraph,
  ShowGraphEdgeFacts,
  ShowGraphNodeFacts,
  Type,
  WiringConversion,
  WiringDiagnostic,
} from "@mechane/domain";
import type { Edge, Node } from "@xyflow/react";

import { handleFor } from "./handle-ids";

/** The domain graph is the adapter's only input; React Flow types stop below. */
export type MappableNode = GraphNode;
export type MappableEdge = GraphEdge;

/**
 * Node geometry. React Flow measures rendered nodes itself, but the initial
 * dimensions must be known before first paint.
 */
/** A node with no rows: the header alone. */
export const NODE_HEIGHT = 56;

export const NODE_WIDTH = 240;

/** One Variable row on a Scene. */
export const VARIABLE_ROW_HEIGHT = 24;

/** Padding below the last row. */
const VARIABLE_LIST_PADDING = 8;

/** Breathing room between a Flow's boundary and the nodes inside it. */
export const FLOW_PADDING = 24;

/** Height of the shared Flow header, above the area its children sit in. */
export const FLOW_HEADER_HEIGHT = 50;

/** First safe child position: below the header and inside the Flow padding. */
export const FLOW_CONTENT_ORIGIN: Position = {
  x: FLOW_PADDING,
  y: FLOW_HEADER_HEIGHT + FLOW_PADDING,
};

/** Minimum explicit size for an empty Flow. */
export const DEFAULT_FLOW_DIMENSIONS: FlowDimensions = {
  width: NODE_WIDTH + FLOW_PADDING,
  height: FLOW_HEADER_HEIGHT + NODE_HEIGHT + FLOW_PADDING,
};

type ShowNodeField = { id: string; name: string; type: Type; value: unknown };
type ShowNodeVariable = { id: string; name: string; type?: Type | null };
type ShowNodeCue = { id: string; name: string; actionCount: number };

type ShowNodeDataBase = {
  /** The node colorway, or its Flow colorway when unset (#316). */
  color: FlowColor;
  name: string;
  /** Show-scoped Shape definitions used to render human-readable type labels. */
  shapes?: readonly Shape[];
  /** Immediate Shape fields rendered as value rows on Source/Transformer nodes. */
  fields: ShowNodeField[];
  /** Scene Variables, in graph order. Empty for every other kind. */
  variables: ShowNodeVariable[];
  /** Scene or Block interaction Cues owned by this node. */
  cues: ShowNodeCue[];
  /**
   * Variables with a producer wired into them. #35's dangling-input marker
   * is the complement: a Variable *not* in here has nothing feeding it.
   */
  wiredVariableIds: string[];
  /** Whether this is the Flow's default-Scene owner. */
  isDefaultScene: boolean;
  /** Nodes inside this Flow. */
  childCount: number;
  /** Devices only: one instance per connection rather than one shared (#45). */
  perConnection: boolean;
  /** Devices only: whether a Flow or top-level Scene drives this Device. */
  driven: boolean;
  /** Devices only: the Show-level pairing code. */
  pairingCode: string | null;
};

type FlowNodeData = ShowNodeDataBase & {
  kind: "flow";
  type: null;
  defaultSceneId: string | null;
  fields: [];
  variables: [];
  wiredVariableIds: [];
  isDefaultScene: false;
  childCount: number;
  perConnection: false;
  driven: false;
  pairingCode: null;
  collapsed: boolean;
};

type SceneNodeData = ShowNodeDataBase & {
  kind: "scene";
  type: null;
  defaultSceneId: null;
  fields: [];
  variables: ShowNodeVariable[];
  childCount: 0;
  perConnection: false;
  driven: false;
  pairingCode: null;
  collapsed?: never;
};

type SourceNodeData = ShowNodeDataBase & {
  kind: "source";
  type: Type | null;
  defaultSceneId: null;
  fields: ShowNodeField[];
  variables: [];
  childCount: 0;
  perConnection: false;
  driven: false;
  pairingCode: null;
  collapsed?: never;
};

type TransformerNodeData = ShowNodeDataBase & {
  kind: "transformer";
  type: Type | null;
  defaultSceneId: null;
  fields: ShowNodeField[];
  variables: [];
  childCount: 0;
  perConnection: false;
  driven: false;
  pairingCode: null;
  collapsed?: never;
};

type DeviceNodeData = ShowNodeDataBase & {
  kind: "device";
  type: null;
  defaultSceneId: null;
  fields: [];
  variables: [];
  wiredVariableIds: [];
  isDefaultScene: false;
  childCount: 0;
  collapsed?: never;
};

export type ShowNodeData =
  | FlowNodeData
  | SceneNodeData
  | SourceNodeData
  | TransformerNodeData
  | DeviceNodeData;

export type ShowEdgeData = {
  kind: EdgeKind;
  /** The Scene Variable a wiring edge feeds — the head of its target path. */
  targetVariableId: string | null;
  coercing: boolean;
  /**
   * The conversion this edge declares, when it has one. `"firstItem"` is the
   * positional array-to-single selection of #532, and stays visible on the
   * edge for as long as the edge does: it changes what the target receives,
   * so it is not a detail an author should have to go looking for.
   */
  conversion: WiringConversion | null;
  invalidReason: string | null;
  /**
   * A live problem with what this edge is carrying — an empty list under a
   * first-item conversion, say. Distinct from `invalidReason`, which is about
   * the edge's *types*: this one is about its current value.
   */
  warningReason: string | null;
  /** The colorway used to render this edge in the editor (#316). */
  color: FlowColor;
  /** Where the author has dragged this edge's runs, if anywhere (#475). */
  layout: EdgeLayout | null;
  /**
   * This edge's place among those sharing both its endpoints — parallel
   * Navigate edges are allowed, one per Cue/Action pairing (#20). Identical
   * endpoints route identically, so without fanning them apart they land on
   * top of each other, handles included, and cannot even be grabbed to
   * separate. `count` is 1 and `index` 0 for an edge with no rivals.
   */
  parallelIndex: number;
  parallelCount: number;
  /**
   * The resolved colorways of the nodes at either end — resolved meaning a
   * node's own color, or its Flow's when unset (#316). #475's edge blends
   * between the two along the run, so it needs both rather than the one
   * inherited color above.
   */
  sourceColor: FlowColor;
  targetColor: FlowColor;
};

/**
 * React Flow handle ids are encoded by ./handle-ids. Keeping that boundary
 * here means graph mapping never needs to know how the ids are represented.
 */
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

/** #475's replacement: self-routing, with draggable per-segment handles. */
export const ROUTED_SMOOTH_STEP_EDGE_TYPE = "routedSmoothStep";

/**
 * Which edge the Show canvas draws. `type` is projected here rather than
 * stored on the graph, so swapping the two is this one constant and no
 * caller has to know React Flow's registry.
 */
const EDGE_TYPE = ROUTED_SMOOTH_STEP_EDGE_TYPE;

/**
 * How tall a node is. Every kind is one header tall except nodes with rows.
 */
export function nodeHeight(
  node: MappableNode,
  shapes: readonly Shape[] = [],
  cueCount = 0,
): number {
  const rowCount =
    node.kind === "scene"
      ? node.variables.length + cueCount
      : node.kind === "source" || node.kind === "transformer"
        ? fieldsForType(node.type, shapes).length
        : 0;
  return rowCount === 0
    ? NODE_HEIGHT
    : NODE_HEIGHT + rowCount * VARIABLE_ROW_HEIGHT + VARIABLE_LIST_PADDING;
}

export interface FlowDimensions {
  width: number;
  height: number;
}

/** Calculates an authored Flow size from its graph-level child bounds. */
export function flowSize(
  children: readonly MappableNode[],
  minimum?: FlowDimensions,
  shapes: readonly Shape[] = [],
  cues: readonly Cue[] = [],
): FlowDimensions {
  const cueCounts = new Map<string, number>();
  for (const cue of cues) {
    if (cue.owner.kind !== "scene") continue;
    cueCounts.set(cue.owner.sceneId, (cueCounts.get(cue.owner.sceneId) ?? 0) + 1);
  }
  const right = children.reduce((max, child) => Math.max(max, child.position.x + NODE_WIDTH), 0);
  const bottom = children.reduce(
    (max, child) =>
      Math.max(max, child.position.y + nodeHeight(child, shapes, cueCounts.get(child.id) ?? 0)),
    0,
  );
  return {
    width: Math.max(minimum?.width ?? 0, Math.max(NODE_WIDTH, right) + FLOW_PADDING),
    height: Math.max(
      minimum?.height ?? 0,
      Math.max(FLOW_HEADER_HEIGHT + NODE_HEIGHT, bottom) + FLOW_PADDING,
    ),
  };
}

export function fieldRows(
  node: MappableNode,
  value: unknown,
  shapes: readonly Shape[],
): { id: string; name: string; type: Type; value: unknown }[] {
  const type = node.kind === "source" || node.kind === "transformer" ? node.type : null;
  const fields = fieldsForType(type, shapes);
  return fields.map((field) => ({
    id: field.id,
    name: field.name,
    type: field.type,
    value: valueAtPath(value, [field.id]),
  }));
}
function nodeData({
  node,
  facts,
  shapes,
  fields,
  variables,
  cues,
  childCount,
  collapsed,
}: {
  node: MappableNode;
  facts: ShowGraphNodeFacts;
  shapes: readonly Shape[] | undefined;
  fields: ShowNodeField[];
  variables: ShowNodeVariable[];
  cues: ShowNodeCue[];
  childCount: number;
  collapsed: boolean;
}): ShowNodeData {
  const type = node.kind === "source" || node.kind === "transformer" ? (node.type ?? null) : null;
  const shared = {
    color: facts.color,
    name: node.name,
    ...(shapes && shapes.length > 0 ? { shapes } : {}),
  };
  switch (node.kind) {
    case "flow":
      return {
        ...shared,
        kind: "flow",
        type: null,
        cues: [],
        fields: [],
        variables: [],
        defaultSceneId: node.defaultSceneId,
        wiredVariableIds: [],
        isDefaultScene: false,
        childCount,
        perConnection: false,
        pairingCode: null,
        driven: false,
        collapsed,
      };
    case "scene":
      return {
        ...shared,
        kind: "scene",
        type: null,
        fields: [],
        cues,
        variables,
        defaultSceneId: null,
        isDefaultScene: facts.isDefaultScene,
        childCount: 0,
        wiredVariableIds: [...facts.wiredVariableIds],
        perConnection: false,
        pairingCode: null,
        driven: false,
      };
    case "source":
      return {
        ...shared,
        kind: "source",
        type,
        fields,
        cues: [],
        variables: [],
        defaultSceneId: null,
        wiredVariableIds: [],
        isDefaultScene: false,
        childCount: 0,
        perConnection: false,
        pairingCode: null,
        driven: false,
      };
    case "transformer":
      return {
        ...shared,
        kind: "transformer",
        type,
        fields,
        variables: [],
        cues: [],
        defaultSceneId: null,
        wiredVariableIds: [],
        isDefaultScene: false,
        childCount: 0,
        perConnection: false,
        pairingCode: null,
        driven: false,
      };
    case "device":
      return {
        ...shared,
        kind: "device",
        type: null,
        fields: [],
        variables: [],
        defaultSceneId: null,
        cues: [],
        wiredVariableIds: [],
        isDefaultScene: false,
        childCount: 0,
        perConnection: node.perConnection,
        pairingCode: node.pairingCode,
        driven: facts.driven,
      };
  }
}
function toFlowNode(
  node: MappableNode,
  children: readonly MappableNode[],
  facts: ShowGraphNodeFacts,
  collapsed: boolean,
  shapes: readonly Shape[] | undefined,
  value: unknown,
  cues: readonly Cue[],
): ShowFlowNode {
  const kind = node.kind;
  const isFlow = kind === "flow";
  const resolvedShapes = shapes ?? [];
  const ownedCues =
    node.kind === "scene"
      ? cues.filter((cue) => cue.owner.kind === "scene" && cue.owner.sceneId === node.id)
      : [];
  const minimumHeight = nodeHeight(node, resolvedShapes, ownedCues.length);
  const dimensions: FlowDimensions = !isFlow
    ? { width: NODE_WIDTH, height: minimumHeight }
    : collapsed
      ? { width: NODE_WIDTH, height: FLOW_HEADER_HEIGHT }
      : (node.size ?? DEFAULT_FLOW_DIMENSIONS);
  const variables =
    node.kind === "scene"
      ? node.variables.map((variable) => ({
          id: variable.id,
          name: variable.name,
          type: variable.type,
        }))
      : [];
  const fields = fieldRows(node, value, resolvedShapes);
  return {
    id: node.id,
    type: isFlow ? FLOW_NODE_TYPE : PLACEHOLDER_NODE_TYPE,
    position: { x: node.position.x, y: node.position.y },
    // Always emitted, `undefined` included: ../reconcile-nodes merges drawn
    // nodes over live ones, and an *omitted* key leaves the live value in
    // place — which after a move out of a Flow is the Flow the node just
    // left. React Flow would go on treating it as a child (dragging the Flow
    // would drag it too) and the next drag would try to extract it again.
    parentId: node.parentId ?? undefined,
    initialWidth: NODE_WIDTH,
    initialHeight: isFlow ? dimensions.height : minimumHeight,
    ...(isFlow ? { width: dimensions.width, height: dimensions.height } : {}),
    style: isFlow ? dimensions : { width: NODE_WIDTH, minHeight: minimumHeight },
    data: nodeData({
      node,
      facts,
      cues: ownedCues.map((cue) => ({
        id: cue.id,
        name: cue.name,
        actionCount: cue.actionIds.length,
      })),
      shapes,
      fields,
      variables,
      childCount: children.length,
      collapsed,
    }),
  };
}
function toFlowEdge(
  edge: MappableEdge,
  graphNodes: readonly MappableNode[],
  facts: ShowGraphEdgeFacts,
  endpointColors: { source: FlowColor; target: FlowColor },
  cueIds: ReadonlySet<string>,
  diagnostic: WiringDiagnostic | undefined,
): ShowFlowEdge {
  const source = graphNodes.find((node) => node.id === edge.sourceId);
  const target = graphNodes.find((node) => node.id === edge.targetId);
  const sourcePath = edge.sourcePath[0];
  return {
    id: edge.id,
    type: EDGE_TYPE,
    source: edge.sourceId,
    target: edge.targetId,
    sourceHandle:
      edge.kind === "navigate" && edge.cueId && cueIds.has(edge.cueId)
        ? handleFor({ kind: "cue", id: edge.cueId })
        : source?.kind === "device" && sourcePath
          ? handleFor({ kind: "deviceSource", name: sourcePath })
          : sourcePath
            ? handleFor({ kind: "field", id: sourcePath })
            : handleFor({ kind: "output" }),
    targetHandle:
      edge.kind === "wiring" && target?.kind === "scene" && facts.targetVariableId
        ? handleFor({ kind: "variable", id: facts.targetVariableId })
        : edge.kind === "wiring" && target?.kind === "transformer" && edge.targetPath[0]
          ? handleFor({ kind: "field", id: edge.targetPath[0] })
          : handleFor({ kind: "input" }),
    data: {
      kind: edge.kind,
      color: facts.color,
      sourceColor: endpointColors.source,
      targetColor: endpointColors.target,
      layout: edge.layout ?? null,
      // Filled in once every edge is mapped: an edge cannot know how many
      // others share its endpoints until they have all been placed.
      parallelIndex: 0,
      parallelCount: 1,
      targetVariableId: facts.targetVariableId,
      coercing: facts.typeCompatibility === "coercing",
      conversion: facts.conversion,
      invalidReason: facts.typeCompatibility === "incompatible" ? "Incompatible types" : null,
      warningReason: diagnostic?.message ?? null,
    },
  };
}

function collapsedFlowOwner(
  nodeId: string,
  nodes: readonly MappableNode[],
  collapsed: ReadonlySet<string>,
): string | null {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  return node?.parentId && collapsed.has(node.parentId) ? node.parentId : null;
}

/**
 * The graph as React Flow wants it. Flows come first: React Flow still
 * requires a parent to appear before its children, and sorting here means
 * no caller has to remember that.
 */
export function graphToFlow(
  graph: ShowGraph | null | undefined,
  options: {
    collapsedFlowIds?: ReadonlySet<string>;
    sourceValues?: Readonly<Record<string, unknown>>;
  } = {},
): {
  nodes: ShowFlowNode[];
  edges: ShowFlowEdge[];
} {
  if (!graph) return { nodes: [], edges: [] };

  const facts = deriveShowGraphFacts(graph);
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

  const cueIds = new Set((graph.cues ?? []).map((cue) => cue.id));
  // Authored Source values are what the Show Editor draws, so a conversion
  // that would find nothing is reported here rather than only once a Run is
  // under way and nobody is looking at this screen (#532).
  const diagnostics = new Map(
    wiringDiagnostics(graph, options.sourceValues ?? {}).map(
      (diagnostic) => [diagnostic.edgeId, diagnostic] as const,
    ),
  );
  return {
    nodes: [...flows, ...rest].reduce<ShowFlowNode[]>((nodes, node) => {
      if (!node.parentId || !collapsed.has(node.parentId)) {
        nodes.push(
          toFlowNode(
            node,
            childrenByParent.get(node.id) ?? [],
            facts.nodes.get(node.id) ?? {
              color: "neutral",
              wiredVariableIds: [],
              isDefaultScene: false,
              driven: false,
            },
            collapsed.has(node.id),
            graph.shapes,
            options.sourceValues?.[node.id],
            graph.cues ?? [],
          ),
        );
      }
      return nodes;
    }, []),
    edges: fanParallelEdges(
      graph.edges
        .map((edge) => {
          const sourceFlow = collapsedFlowOwner(edge.sourceId, graph.nodes, collapsed);
          const targetFlow = collapsedFlowOwner(edge.targetId, graph.nodes, collapsed);
          if (sourceFlow && sourceFlow === targetFlow) return null;
          const mapped = toFlowEdge(
            edge,
            graph.nodes,
            facts.edges.get(edge.id) ?? {
              targetVariableId: null,
              sourceType: null,
              targetType: null,
              typeCompatibility: "unknown",
              conversion: null,
              color: "neutral",
            },
            {
              // An edge re-anchored onto a collapsed Flow takes that Flow's
              // color: the box it now leaves or lands on is the Flow itself.
              source: facts.nodes.get(sourceFlow ?? edge.sourceId)?.color ?? DEFAULT_FLOW_COLOR,
              target: facts.nodes.get(targetFlow ?? edge.targetId)?.color ?? DEFAULT_FLOW_COLOR,
            },
            cueIds,
            diagnostics.get(edge.id),
          );
          return {
            ...mapped,
            ...(sourceFlow
              ? { source: sourceFlow, sourceHandle: handleFor({ kind: "output" }) }
              : {}),
            ...(targetFlow
              ? { target: targetFlow, targetHandle: handleFor({ kind: "input" }) }
              : {}),
          };
        })
        .filter((edge): edge is ShowFlowEdge => edge !== null),
    ),
  };
}

/**
 * Numbers each edge within the set sharing both its handles, so the edge can
 * fan itself apart from its rivals.
 *
 * Counted *after* collapse re-anchoring, because that is what creates most of
 * the collisions: several edges into a collapsed Flow all land on its single
 * input handle, and are then as indistinguishable as parallel Navigate edges
 * between one pair of Scenes.
 */
function fanParallelEdges(edges: readonly ShowFlowEdge[]): ShowFlowEdge[] {
  const groups = new Map<string, ShowFlowEdge[]>();
  for (const edge of edges) {
    const key = parallelKey(edge);
    const group = groups.get(key);
    if (group) group.push(edge);
    else groups.set(key, [edge]);
  }

  return edges.map((edge) => {
    const group = groups.get(parallelKey(edge)) ?? [edge];
    if (!edge.data || group.length === 1) return edge;
    return {
      ...edge,
      data: { ...edge.data, parallelIndex: group.indexOf(edge), parallelCount: group.length },
    };
  });
}

function parallelKey(edge: ShowFlowEdge): string {
  return [edge.source, edge.sourceHandle, edge.target, edge.targetHandle].join("\u0000");
}

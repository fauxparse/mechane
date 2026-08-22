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
import {
  areTypesCompatible,
  DEFAULT_FLOW_COLOR,
  defaultValueForType,
  deviceSourceType,
  fieldsForType,
  findCoercion,
  isEdgeKind,
  isNodeKind,
  setValueAtPath,
  typeAtPath,
  valueAtPath,
} from "@mechane/domain";
import type {
  EdgeKind,
  FlowColor,
  NodeKind,
  Position,
  PrimitiveType,
  Shape,
  SourceFieldDefault,
  Type,
} from "@mechane/domain";
import type { Edge, Node } from "@xyflow/react";

/**
 * A node as this mapper needs it described. Structural rather than named, so
 * the domain's discriminated union and other graph fixtures can use the same
 * rendering path. The GraphQL interface has already been converted by
 * ./api-graph before the editor reaches this mapper.
 */
export interface MappableNode {
  id: string;
  kind: string;
  name: string;
  position: Position;
  parentId?: string | null;
  defaultSceneId?: string | null;
  color?: FlowColor | null;
  type?: unknown;
  variables?: readonly { id: string; name: string; type?: unknown }[] | null;
  fieldDefaults?: readonly { fieldPath: readonly string[]; value: unknown }[] | null;
  perConnection?: boolean | null;
  pairingCode?: string | null;
}

export interface MappableEdge {
  id: string;
  kind: string;
  sourceId: string;
  targetId: string;
  sourcePath?: readonly string[] | null;
  targetPath?: readonly string[] | null;
  targetVariableId?: string | null;
  fieldMapping?: unknown;
}

/**
 * Node geometry. React Flow measures rendered nodes itself, but the initial
 * dimensions must be known before first paint. Flows can be resized locally;
 * their dimensions remain a minimum and grow when children need more room.
 */
/** A node with no rows: the header alone. */
export const NODE_HEIGHT = 56;

export const NODE_WIDTH = 240;

/** One Variable row on a Scene. */
export const VARIABLE_ROW_HEIGHT = 24;

/** One Shape field row on a typed Source or Transformer. */
export const SHAPE_FIELD_ROW_HEIGHT = 24;

/** Padding below the last row. */
const VARIABLE_LIST_PADDING = 8;

/** Breathing room between a Flow's boundary and the nodes inside it. */
const FLOW_PADDING = 24;

/** Height of the shared Flow header, above the area its children sit in. */
export const FLOW_HEADER_HEIGHT = 50;

/** First safe child position: below the header and inside the Flow padding. */
export const FLOW_CONTENT_ORIGIN: Position = {
  x: FLOW_PADDING,
  y: FLOW_HEADER_HEIGHT + FLOW_PADDING,
};

// `type`, not `interface`: React Flow v12 constrains node and edge data to
// `Record<string, unknown>`, which an interface does not satisfy structurally
// (interfaces have no implicit index signature).
export type ShowNodeData = {
  /** The node colorway, or its Flow colorway when unset (#316). */
  color: FlowColor;
  kind: NodeKind;
  name: string;
  type: Type | null;
  /** Show-scoped Shape definitions used to render human-readable type labels. */
  shapes?: readonly Shape[];
  /** Immediate Shape fields rendered as value rows on Source/Transformer nodes. */
  fields: { id: string; name: string; type: Type; value: unknown }[];
  /** Scene Variables, in graph order. Empty for every other kind. */
  variables: { id: string; name: string; type?: Type | null }[];
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
  coercing: boolean;
  invalidReason: string | null;
  /** The colorway used to render this edge in the editor (#316). */
  color: FlowColor;
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
 * How tall a node is. Every kind is one header tall except nodes with rows.
 */
export function nodeHeight(
  node: MappableNode,
  shapes: readonly Shape[] = [],
): number {
  const rowCount =
    node.kind === "scene"
      ? (node.variables?.length ?? 0)
      : node.kind === "source" || node.kind === "transformer"
        ? fieldsForType(node.type as Type | null | undefined, shapes).length
        : 0;
  return rowCount === 0
    ? NODE_HEIGHT
    : NODE_HEIGHT + rowCount * VARIABLE_ROW_HEIGHT + VARIABLE_LIST_PADDING;
}

export interface FlowDimensions {
  width: number;
  height: number;
}

export function flowSize(
  children: readonly MappableNode[],
  minimum?: FlowDimensions,
  shapes: readonly Shape[] = [],
): FlowDimensions {
  const right = children.reduce((max, child) => Math.max(max, child.position.x + NODE_WIDTH), 0);
  const bottom = children.reduce(
    (max, child) => Math.max(max, child.position.y + nodeHeight(child, shapes)),
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

function fieldRows(
  node: MappableNode,
  shapes: readonly Shape[],
  graphDefaults: readonly SourceFieldDefault[],
): { id: string; name: string; type: Type; value: unknown }[] {
  const fields = fieldsForType(node.type as Type | null | undefined, shapes);
  let value =
    node.kind === "source" && node.type
      ? defaultValueForType(node.type as Type, shapes)
      : undefined;
  if (node.kind === "source" && value !== undefined) {
    const overrides = [
      ...graphDefaults.filter((override) => override.nodeId === node.id),
      ...(node.fieldDefaults ?? []),
    ];
    for (const override of overrides) {
      value = setValueAtPath(value, override.fieldPath, override.value);
    }
  }
  return fields.map((field) => ({
    id: field.id,
    name: field.name,
    type: field.type,
    value: valueAtPath(value, [field.id]),
  }));
}

function toFlowNode(
  node: MappableNode,
  children: readonly MappableNode[],
  wiredVariableIds: Set<string>,
  defaultSceneIds: Set<string>,
  drivenDeviceIds: Set<string>,
  collapsed: boolean,
  minimumDimensions: FlowDimensions | undefined,
  color: FlowColor,
  shapes: readonly Shape[] | undefined,
  graphDefaults: readonly SourceFieldDefault[],
): ShowFlowNode {
  const kind = nodeKindOf(node);
  const isFlow = kind === "flow";
  const resolvedShapes = shapes ?? [];
  const minimumHeight = nodeHeight(node, resolvedShapes);
  return {
    id: node.id,
    type: isFlow ? FLOW_NODE_TYPE : PLACEHOLDER_NODE_TYPE,
    position: { x: node.position.x, y: node.position.y },
    ...(node.parentId ? { parentId: node.parentId } : {}),
    initialWidth: NODE_WIDTH,
    initialHeight: isFlow
      ? collapsed
        ? FLOW_HEADER_HEIGHT
        : flowSize(children, minimumDimensions, resolvedShapes).height
      : minimumHeight,
    ...(isFlow
      ? {
          width: collapsed ? NODE_WIDTH : flowSize(children, minimumDimensions, resolvedShapes).width,
          height: collapsed
            ? FLOW_HEADER_HEIGHT
            : flowSize(children, minimumDimensions, resolvedShapes).height,
        }
      : {}),
    style: isFlow
      ? collapsed
        ? { width: NODE_WIDTH, height: FLOW_HEADER_HEIGHT }
        : flowSize(children, minimumDimensions, resolvedShapes)
      : { width: NODE_WIDTH, minHeight: minimumHeight },
    data: {
      color,
      kind,
      name: node.name,
      type: (node.type as Type | null | undefined) ?? null,
      ...(shapes && shapes.length > 0 ? { shapes } : {}),
      variables: [...(node.variables ?? [])].map((variable) => ({
        ...variable,
        type: variable.type as Type | null | undefined,
      })),
      fields: fieldRows(node, resolvedShapes, graphDefaults),
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

function toFlowEdge(
  edge: MappableEdge,
  graphNodes: readonly MappableNode[],
  shapes: readonly Shape[] = [],
): ShowFlowEdge {
  if (!isEdgeKind(edge.kind)) {
    throw new Error(`Unknown Show graph edge kind "${edge.kind}" on edge "${edge.id}".`);
  }
  const source = graphNodes.find((node) => node.id === edge.sourceId);
  const target = graphNodes.find((node) => node.id === edge.targetId);
  const targetVariableId =
    edge.targetVariableId ?? (target?.kind === "scene" ? edge.targetPath?.[0] ?? null : null);
  const sourceParentId = source?.parentId ?? null;
  const targetParentId = target?.parentId ?? null;
  const sourceWholeType =
    source?.kind === "source" || source?.kind === "transformer"
      ? (source.type as Type | null | undefined)
      : null;
  const sourceType =
    source?.kind === "device"
      ? deviceSourceType(edge.sourcePath?.[0])
      : sourceWholeType && edge.sourcePath && edge.sourcePath.length > 0
        ? typeAtPath(sourceWholeType, edge.sourcePath, shapes)
        : sourceWholeType;
  const color =
    sourceParentId !== null && sourceParentId === targetParentId
      ? (graphNodes.find((node) => node.id === sourceParentId)?.color ?? DEFAULT_FLOW_COLOR)
      : DEFAULT_FLOW_COLOR;
  const sceneVariable =
    target?.kind === "scene"
      ? target.variables?.find((variable) => variable.id === targetVariableId)
      : undefined;
  const targetType =
    target?.kind === "transformer" && target.type && edge.targetPath && edge.targetPath.length > 0
      ? typeAtPath(target.type as Type, edge.targetPath, shapes)
      : (sceneVariable?.type as Type | null | undefined) ?? null;
  const coercing =
    edge.kind === "wiring" &&
    typeof sourceType === "string" &&
    typeof targetType === "string" &&
    sourceType !== targetType &&
    findCoercion(sourceType as PrimitiveType, targetType as PrimitiveType) !== undefined;
  const invalidReason =
    edge.kind === "wiring" &&
    sourceType &&
    targetType &&
    !areTypesCompatible(sourceType, targetType, shapes)
      ? "Incompatible types"
      : null;
  return {
    id: edge.id,
    type: SMART_SMOOTH_STEP_EDGE_TYPE,
    source: edge.sourceId,
    target: edge.targetId,
    sourceHandle:
      source?.kind === "device" && edge.sourcePath?.[0]
        ? edge.sourcePath[0]
        : edge.sourcePath && edge.sourcePath.length > 0
          ? edge.sourcePath[0]
          : OUTPUT_HANDLE,
    targetHandle:
      edge.kind === "wiring" && target?.kind === "scene" && targetVariableId
        ? targetVariableId
        : edge.kind === "wiring" && target?.kind === "transformer" && edge.targetPath?.[0]
          ? edge.targetPath[0]
          : INPUT_HANDLE,
    data: {
      kind: edge.kind,
      color,
      // The wire shape resolves the Variable for the client; the domain shape
      // carries it as the head of the target path (`wiringTargetVariableId`),
      // so read whichever one is there.
      targetVariableId,
      coercing,
      invalidReason,
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
  graph:
    | {
        nodes: readonly MappableNode[];
        edges: readonly MappableEdge[];
        shapes?: readonly Shape[];
        sourceFieldDefaults?: readonly SourceFieldDefault[];
      }
    | null
    | undefined,
  options: {
    collapsedFlowIds?: ReadonlySet<string>;
    flowDimensions?: ReadonlyMap<string, FlowDimensions>;
  } = {},
): {
  nodes: ShowFlowNode[];
  edges: ShowFlowEdge[];
} {
  if (!graph) return { nodes: [], edges: [] };

  const collapsed = options.collapsedFlowIds ?? new Set<string>();
  const flowDimensions = options.flowDimensions ?? new Map<string, FlowDimensions>();
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
  const flowColors = new Map(
    flows.map((flow) => [flow.id, flow.color ?? DEFAULT_FLOW_COLOR] as const),
  );

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
            flowDimensions.get(node.id),
            node.color ??
              (node.kind === "flow"
                ? DEFAULT_FLOW_COLOR
                : ((node.parentId ? flowColors.get(node.parentId) : undefined) ??
                  DEFAULT_FLOW_COLOR)),
            graph.shapes,
            graph.sourceFieldDefaults ?? [],
          ),
        );
      }
      return nodes;
    }, []),
    edges: graph.edges
      .map((edge) => {
        const sourceFlow = collapsedFlowOwner(edge.sourceId, graph.nodes, collapsed);
        const targetFlow = collapsedFlowOwner(edge.targetId, graph.nodes, collapsed);
        if (sourceFlow && sourceFlow === targetFlow) return null;
        const mapped = toFlowEdge(edge, graph.nodes, graph.shapes);
        return {
          ...mapped,
          ...(sourceFlow ? { source: sourceFlow, sourceHandle: OUTPUT_HANDLE } : {}),
          ...(targetFlow ? { target: targetFlow, targetHandle: INPUT_HANDLE } : {}),
        };
      })
      .filter((edge): edge is ShowFlowEdge => edge !== null),
  };
}

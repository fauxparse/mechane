import type { FlowColor, GraphEdge, GraphNode, ShowGraph, WiringEdge } from "./graph";
import { DEFAULT_FLOW_COLOR, deviceSourceType, wiringTargetVariableId } from "./graph";
import { typeAtPath } from "./property-values";
import type { PrimitiveType, Type } from "./shapes";
import { areTypesCompatible, findCoercion, PRIMITIVE_TYPES } from "./shapes";

function isPrimitiveType(value: Type): value is PrimitiveType {
  return typeof value === "string" && PRIMITIVE_TYPES.includes(value);
}

export type TypeCompatibility = "unknown" | "compatible" | "coercing" | "incompatible";

export interface ShowGraphNodeFacts {
  /** The node color, inheriting its containing Flow when unset. */
  color: FlowColor;
  /** Variable ids that have a wiring producer. */
  wiredVariableIds: readonly string[];
  /** Whether this Scene is the entry Scene of its Flow. */
  isDefaultScene: boolean;
  /** Whether a Flow or top-level Scene drives this Device. */
  driven: boolean;
}

export interface ShowGraphEdgeFacts {
  /** The Variable a wiring edge feeds, when it has one. */
  targetVariableId: string | null;
  /** The resolved type at the producer end of the edge. */
  sourceType: Type | null;
  /** The resolved type at the consumer end of the edge. */
  targetType: Type | null;
  /** The domain's answer for whether the edge can carry its value. */
  typeCompatibility: TypeCompatibility;
  /** The color inherited by an edge within one Flow. */
  color: FlowColor;
}

export interface ShowGraphFacts {
  nodes: ReadonlyMap<string, ShowGraphNodeFacts>;
  edges: ReadonlyMap<string, ShowGraphEdgeFacts>;
}

function nodeById(graph: ShowGraph): ReadonlyMap<string, GraphNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function flowColors(graph: ShowGraph): ReadonlyMap<string, FlowColor> {
  return new Map(
    graph.nodes
      .filter((node): node is Extract<GraphNode, { kind: "flow" }> => node.kind === "flow")
      .map((flow) => [flow.id, flow.color ?? DEFAULT_FLOW_COLOR] as const),
  );
}

function inheritedColor(node: GraphNode, colors: ReadonlyMap<string, FlowColor>): FlowColor {
  return (
    node.color ??
    (node.parentId ? (colors.get(node.parentId) ?? DEFAULT_FLOW_COLOR) : DEFAULT_FLOW_COLOR)
  );
}

function wiredVariables(
  graph: ShowGraph,
  nodes: ReadonlyMap<string, GraphNode>,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== "wiring") continue;
    const target = nodes.get(edge.targetId);
    if (target?.kind === "scene") ids.add(wiringTargetVariableId(edge));
  }
  return ids;
}

function defaultScenes(graph: ShowGraph): ReadonlySet<string> {
  return new Set(
    graph.nodes
      .filter((node): node is Extract<GraphNode, { kind: "flow" }> => node.kind === "flow")
      .flatMap((flow) => (flow.defaultSceneId ? [flow.defaultSceneId] : [])),
  );
}

function drivenDevices(graph: ShowGraph): ReadonlySet<string> {
  return new Set(
    graph.edges
      .filter((edge): edge is Extract<GraphEdge, { kind: "device" }> => edge.kind === "device")
      .map((edge) => edge.targetId),
  );
}

function sourceType(
  edge: WiringEdge,
  source: GraphNode | undefined,
  shapes: ShowGraph["shapes"],
): Type | null {
  if (source?.kind === "device") return deviceSourceType(edge.sourcePath[0]);
  if (source?.kind !== "source" && source?.kind !== "transformer") return null;
  if (!source.type) return null;
  return edge.sourcePath.length > 0
    ? typeAtPath(source.type, edge.sourcePath, shapes ?? [])
    : source.type;
}

function targetType(
  edge: WiringEdge,
  target: GraphNode | undefined,
  targetVariableId: string | null,
  shapes: ShowGraph["shapes"],
): Type | null {
  if (!target) return null;
  if (target.kind === "transformer") {
    if (!target.type) return null;
    return edge.targetPath.length > 0
      ? typeAtPath(target.type, edge.targetPath, shapes ?? [])
      : target.type;
  }
  if (target.kind === "source") return target.type;
  if (target.kind !== "scene" || targetVariableId === null) return null;
  const variable = target.variables.find((candidate) => candidate.id === targetVariableId);
  if (!variable?.type) return null;
  return edge.targetPath.length > 1
    ? typeAtPath(variable.type, edge.targetPath.slice(1), shapes ?? [])
    : variable.type;
}

function compatibility(
  source: Type | null,
  target: Type | null,
  shapes: ShowGraph["shapes"],
): TypeCompatibility {
  if (!source || !target) return "unknown";
  if (!areTypesCompatible(source, target, shapes ?? [])) return "incompatible";
  if (
    isPrimitiveType(source) &&
    isPrimitiveType(target) &&
    source !== target &&
    findCoercion(source, target) !== undefined
  ) {
    return "coercing";
  }
  return "compatible";
}

function edgeFacts(
  edge: GraphEdge,
  nodes: ReadonlyMap<string, GraphNode>,
  colors: ReadonlyMap<string, FlowColor>,
  shapes: ShowGraph["shapes"],
): ShowGraphEdgeFacts {
  const source = nodes.get(edge.sourceId);
  const target = nodes.get(edge.targetId);
  const targetVariableId =
    edge.kind === "wiring" && target?.kind === "scene" ? wiringTargetVariableId(edge) : null;
  const sourceTypeValue = edge.kind === "wiring" ? sourceType(edge, source, shapes) : null;
  const targetTypeValue =
    edge.kind === "wiring" ? targetType(edge, target, targetVariableId, shapes) : null;
  const sourceParentId = source?.parentId ?? null;
  const targetParentId = target?.parentId ?? null;
  return {
    targetVariableId,
    sourceType: sourceTypeValue,
    targetType: targetTypeValue,
    typeCompatibility: compatibility(sourceTypeValue, targetTypeValue, shapes),
    color:
      sourceParentId !== null && sourceParentId === targetParentId
        ? (colors.get(sourceParentId) ?? DEFAULT_FLOW_COLOR)
        : DEFAULT_FLOW_COLOR,
  };
}

/** Derives reusable Show graph facts without depending on a rendering vendor. */
export function deriveShowGraphFacts(graph: ShowGraph): ShowGraphFacts {
  const nodes = nodeById(graph);
  const colors = flowColors(graph);
  const wired = wiredVariables(graph, nodes);
  const defaults = defaultScenes(graph);
  const driven = drivenDevices(graph);
  return {
    nodes: new Map(
      graph.nodes.map((node) => [
        node.id,
        {
          color: inheritedColor(node, colors),
          wiredVariableIds:
            node.kind === "scene"
              ? node.variables
                  .filter((variable) => wired.has(variable.id))
                  .map((variable) => variable.id)
              : [],
          isDefaultScene: node.kind === "scene" && defaults.has(node.id),
          driven: node.kind === "device" && driven.has(node.id),
        },
      ]),
    ),
    edges: new Map(
      graph.edges.map((edge) => [edge.id, edgeFacts(edge, nodes, colors, graph.shapes)]),
    ),
  };
}

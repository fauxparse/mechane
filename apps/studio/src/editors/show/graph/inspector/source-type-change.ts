import type { GraphEdit } from "@mechane/commands";
import { GRAPH_COMMAND_TYPES } from "@mechane/commands";
import {
  coerceShapeValue,
  coerceValue,
  fieldsForType,
  findNode,
  formatValuePath,
  sourceDefaultsFor,
  typeAtPath,
  wiringTargetVariableId,
  wiringTypesCompatible,
} from "@mechane/domain";
import type { GraphEdge, Shape, ShowGraph, SourceNode, Type } from "@mechane/domain";

export interface SourceTypeEdgeImpact {
  readonly edge: Extract<GraphEdge, { kind: "wiring" }>;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly reason: string;
}

export interface SourceTypeDefaultImpact {
  readonly fieldPath: readonly string[];
  readonly reason: string;
  readonly losses: readonly string[];
}

export interface SourceTypeMappingChange {
  readonly edgeId: string;
  readonly mapping: Record<string, string> | null;
  readonly sourcePath: string;
  readonly targetPath: string;
}

export interface SourceTypeChangePlan {
  readonly nodeId: string;
  readonly from: Type;
  readonly to: Type;
  readonly edgeRemovals: readonly SourceTypeEdgeImpact[];
  readonly defaultImpacts: readonly SourceTypeDefaultImpact[];
  readonly mappingChanges: readonly SourceTypeMappingChange[];
  readonly migratedDefaults: readonly {
    fieldPath: readonly string[];
    value: unknown;
    losses: readonly string[];
  }[];
  readonly edits: readonly GraphEdit[];
}

function sourceTypeAtPath(
  type: Type,
  edge: Extract<GraphEdge, { kind: "wiring" }>,
  shapes: readonly Shape[],
) {
  return typeAtPath(type, edge.sourcePath, shapes);
}

function targetTypeAtPath(
  graph: ShowGraph,
  edge: Extract<GraphEdge, { kind: "wiring" }>,
): Type | null {
  const target = findNode(graph, edge.targetId);
  if (!target) return null;
  const shapes = graph.shapes ?? [];
  if (target.kind === "source") return typeAtPath(target.type, edge.targetPath, shapes);
  if (target.kind === "transformer") {
    return target.type ? typeAtPath(target.type, edge.targetPath, shapes) : null;
  }
  if (target.kind !== "scene") return null;
  const variable = target.variables.find(
    (candidate) => candidate.id === wiringTargetVariableId(edge),
  );
  return variable?.type ? typeAtPath(variable.type, edge.targetPath.slice(1), shapes) : null;
}

function mappingFor(
  graph: ShowGraph,
  edge: Extract<GraphEdge, { kind: "wiring" }>,
  sourceType: Type,
): Record<string, string> | null {
  if (!edge.fieldMapping) return null;
  const source = fieldsForType(
    sourceTypeAtPath(sourceType, edge, graph.shapes ?? []),
    graph.shapes ?? [],
  );
  const targetType = targetTypeAtPath(graph, edge);
  const target = fieldsForType(targetType, graph.shapes ?? []);
  const sourceIds = new Set(source.map((field) => field.id));
  const targetIds = new Set(target.map((field) => field.id));
  const mapping = Object.fromEntries(
    Object.entries(edge.fieldMapping).filter(
      ([sourceId, targetId]) => sourceIds.has(sourceId) && targetIds.has(targetId),
    ),
  );
  return Object.keys(mapping).length > 0 ? mapping : null;
}

function coerceDefault(
  value: unknown,
  from: Type,
  to: Type,
  shapes: readonly Shape[],
): { value: unknown; losses: string[] } | null {
  if (value === null || JSON.stringify(from) === JSON.stringify(to)) {
    return { value, losses: [] };
  }
  try {
    if (typeof from === "string" && typeof to === "string") {
      return { value: coerceValue(value, from, to), losses: [] };
    }
    if (typeof to !== "string" && to.kind === "array") {
      const fromElement = typeof from !== "string" && from.kind === "array" ? from.of : from;
      const values = Array.isArray(value) ? value : [value];
      const converted = values.map((item) => coerceDefault(item, fromElement, to.of, shapes));
      if (converted.some((item) => item === null)) return null;
      return {
        value: converted.map((item) => item?.value),
        losses: converted.flatMap((item) => item?.losses ?? []),
      };
    }
    if (
      typeof from !== "string" &&
      from.kind === "shape" &&
      typeof to !== "string" &&
      to.kind === "shape"
    ) {
      const oldShape = shapes.find((shape) => shape.id === from.shapeId);
      const newShape = shapes.find((shape) => shape.id === to.shapeId);
      if (!oldShape || !newShape) return null;
      const result = coerceShapeValue(value, oldShape, newShape, shapes);
      return {
        value: result.value,
        losses: result.losses.map((loss) => `${formatValuePath(loss.path)}: ${loss.reason}`),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function sourceNode(graph: ShowGraph, nodeId: string): SourceNode | null {
  const node = findNode(graph, nodeId);
  return node?.kind === "source" ? node : null;
}

export function planSourceTypeChange(
  graph: ShowGraph,
  nodeId: string,
  nextType: Type,
): SourceTypeChangePlan | null {
  const node = sourceNode(graph, nodeId);
  if (!node || JSON.stringify(node.type) === JSON.stringify(nextType)) return null;
  const shapes = graph.shapes ?? [];
  const candidate: ShowGraph = {
    ...graph,
    nodes: graph.nodes.map((current) =>
      current.id === nodeId && current.kind === "source" ? { ...current, type: nextType } : current,
    ),
  };
  const edgeRemovals: SourceTypeEdgeImpact[] = [];
  const mappingChanges: SourceTypeMappingChange[] = [];
  for (const edge of graph.edges) {
    if (edge.kind !== "wiring") continue;
    const isOutgoing = edge.sourceId === nodeId;
    const isIncoming = edge.targetId === nodeId;
    if (!isOutgoing && !isIncoming) continue;

    const nextSourceType = isOutgoing
      ? sourceTypeAtPath(nextType, edge, shapes)
      : (() => {
          const producer = findNode(graph, edge.sourceId);
          return producer?.kind === "source" || producer?.kind === "transformer"
            ? producer.type
              ? sourceTypeAtPath(producer.type, edge, shapes)
              : null
            : null;
        })();
    const nextTargetType = isIncoming
      ? typeAtPath(nextType, edge.targetPath, shapes)
      : targetTypeAtPath(candidate, edge);
    const invalidPath = isOutgoing ? nextSourceType === null : nextTargetType === null;
    // The edge keeps whatever conversion it declares, so a retype that leaves
    // a first-item edge still able to select a compatible item leaves the edge
    // alone rather than removing it (#532).
    const incompatible =
      !invalidPath &&
      nextSourceType !== null &&
      nextTargetType !== null &&
      !wiringTypesCompatible(nextSourceType, nextTargetType, edge.conversion, shapes);
    if (invalidPath || incompatible) {
      edgeRemovals.push({
        edge,
        sourcePath: formatValuePath(edge.sourcePath) || "Value",
        targetPath: formatValuePath(edge.targetPath) || "Value",
        reason: invalidPath
          ? "This connection no longer has a usable value"
          : "The connected value is not compatible with this type",
      });
      continue;
    }
    if (isOutgoing && edge.fieldMapping) {
      const mapping = mappingFor(candidate, edge, nextType);
      if (JSON.stringify(mapping) !== JSON.stringify(edge.fieldMapping)) {
        mappingChanges.push({
          edgeId: edge.id,
          mapping,
          sourcePath: formatValuePath(edge.sourcePath) || "Value",
          targetPath: formatValuePath(edge.targetPath) || "Value",
        });
      }
    }
  }
  const removedEdgeIds = new Set(edgeRemovals.map((impact) => impact.edge.id));
  const hasSurvivingIncomingConnection = graph.edges.some(
    (edge) => edge.kind === "wiring" && edge.targetId === nodeId && !removedEdgeIds.has(edge.id),
  );

  const defaultImpacts: SourceTypeDefaultImpact[] = [];
  const migratedDefaults: {
    fieldPath: readonly string[];
    value: unknown;
    losses: readonly string[];
  }[] = [];
  const edits: GraphEdit[] = [
    { type: GRAPH_COMMAND_TYPES.setSourceType, nodeId, sourceType: nextType },
  ];
  for (const override of sourceDefaultsFor(graph, nodeId)) {
    if (hasSurvivingIncomingConnection) continue;
    const oldFieldType = typeAtPath(node.type, override.fieldPath, shapes);
    const newFieldType = typeAtPath(nextType, override.fieldPath, shapes);
    if (!newFieldType) {
      defaultImpacts.push({
        fieldPath: override.fieldPath,
        reason: "This saved field is no longer available",
        losses: [],
      });
      edits.push({
        type: GRAPH_COMMAND_TYPES.setSourceFieldDefault,
        nodeId,
        fieldPath: override.fieldPath,
        value: null,
      });
      continue;
    }
    if (!oldFieldType) continue;
    const converted = coerceDefault(override.value, oldFieldType, newFieldType, shapes);
    if (!converted) {
      defaultImpacts.push({
        fieldPath: override.fieldPath,
        reason: "This saved value no longer matches the new type",
        losses: [],
      });
      edits.push({
        type: GRAPH_COMMAND_TYPES.setSourceFieldDefault,
        nodeId,
        fieldPath: override.fieldPath,
        value: null,
      });
      continue;
    }
    if (
      JSON.stringify(converted.value) !== JSON.stringify(override.value) ||
      converted.losses.length > 0
    ) {
      if (converted.losses.length > 0) {
        defaultImpacts.push({
          fieldPath: override.fieldPath,
          reason: "This saved value loses information",
          losses: converted.losses,
        });
      }
      migratedDefaults.push({
        fieldPath: override.fieldPath,
        value: converted.value,
        losses: converted.losses,
      });
      edits.push({
        type: GRAPH_COMMAND_TYPES.setSourceFieldDefault,
        nodeId,
        fieldPath: override.fieldPath,
        value: converted.value,
      });
    }
  }
  for (const change of mappingChanges) {
    edits.push({
      type: GRAPH_COMMAND_TYPES.setWiringFieldMapping,
      edgeId: change.edgeId,
      fieldMapping: change.mapping,
    });
  }
  for (const removal of edgeRemovals) {
    edits.push({ type: GRAPH_COMMAND_TYPES.removeEdge, edgeId: removal.edge.id });
  }
  return {
    nodeId,
    from: node.type,
    to: nextType,
    edgeRemovals,
    defaultImpacts,
    mappingChanges,
    migratedDefaults,
    edits,
  };
}

export function sourceTypeChangeHasImpact(plan: SourceTypeChangePlan): boolean {
  return (
    plan.edgeRemovals.length > 0 || plan.defaultImpacts.length > 0 || plan.mappingChanges.length > 0
  );
}

export function sourceTypeChangeSignature(plan: SourceTypeChangePlan): string {
  return JSON.stringify({
    from: plan.from,
    to: plan.to,
    edges: plan.edgeRemovals.map((impact) => [impact.edge.id, impact.reason]),
    defaults: plan.defaultImpacts.map((impact) => [impact.fieldPath, impact.reason, impact.losses]),
    mappings: plan.mappingChanges.map((change) => [change.edgeId, change.mapping]),
  });
}

import {
  DEVICE_SOURCE_HANDLES,
  deviceSourceType,
  type DeviceNode,
  type ShowGraph,
  type SourceNode,
  type WiringEdge,
} from "./graph";
import { typeAtPath } from "./property-values";
import { defaultSourceValues, defaultValueForType, type SourceValues } from "./source-defaults";
import { deviceQrImageValue } from "./device-qr";
import { resolveShapeFieldMapping } from "./shapes";

function valueAtPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (current === null || typeof current !== "object" || !(segment in current)) return undefined;
    current = Reflect.get(current, segment);
  }
  return current;
}

function assignAtPath(current: unknown, path: readonly string[], value: unknown): unknown {
  if (path.length === 0) return value;
  const [segment, ...rest] = path;
  if (segment === undefined) return value;
  const object =
    current !== null && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  object[segment] = assignAtPath(object[segment], rest, value);
  return object;
}

function mergeRuntimeValue(designValue: unknown, runtimeValue: unknown): unknown {
  if (runtimeValue === undefined) return designValue;
  const designEntries =
    designValue !== null && typeof designValue === "object" && !Array.isArray(designValue)
      ? Object.entries(designValue)
      : null;
  const runtimeEntries =
    runtimeValue !== null && typeof runtimeValue === "object" && !Array.isArray(runtimeValue)
      ? Object.entries(runtimeValue)
      : null;
  if (designEntries && runtimeEntries) {
    const designFields = new Map(designEntries);
    const merged: Record<string, unknown> = Object.fromEntries(designEntries);
    for (const [key, value] of runtimeEntries) {
      merged[key] = mergeRuntimeValue(designFields.get(key), value);
    }
    return merged;
  }
  return runtimeValue;
}

function remapFields(value: unknown, mapping: Record<string, string> | undefined): unknown {
  if (!mapping || Object.keys(mapping).length === 0) return value;
  const entries =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value)
      : null;
  if (!entries) return value;
  return Object.fromEntries(
    entries.flatMap(([sourceFieldId, fieldValue]) => {
      const targetFieldId = mapping[sourceFieldId];
      return targetFieldId === undefined ? [] : [[targetFieldId, fieldValue]];
    }),
  );
}

function producerType(graph: ShowGraph, edge: WiringEdge) {
  const producer = graph.nodes.find((node) => node.id === edge.sourceId);
  if (!producer) return null;
  if (producer.kind === "device") return deviceSourceType(edge.sourcePath[0]);
  if (producer.kind !== "source") return null;
  return typeAtPath(producer.type, edge.sourcePath, graph.shapes ?? []);
}

function targetType(graph: ShowGraph, edge: WiringEdge) {
  const target = graph.nodes.find((node) => node.id === edge.targetId);
  if (target?.kind === "source") return target.type;
  if (target?.kind !== "scene") return null;
  const [variableId, ...variablePath] = edge.targetPath;
  const variable = target.variables.find((candidate) => candidate.id === variableId);
  return variable?.type ? typeAtPath(variable.type, variablePath, graph.shapes ?? []) : null;
}

function fieldMappingFor(graph: ShowGraph, edge: WiringEdge): Record<string, string> | undefined {
  if (edge.fieldMapping && Object.keys(edge.fieldMapping).length > 0) return edge.fieldMapping;
  const from = producerType(graph, edge);
  const to = targetType(graph, edge);
  if (!from || !to) return undefined;
  const mapping = resolveShapeFieldMapping(from, to, graph.shapes ?? []);
  return Object.keys(mapping).length > 0 ? mapping : undefined;
}

function deviceValue(node: DeviceNode, sourcePath: readonly string[]): unknown {
  if (!node.pairingCode) return undefined;
  switch (sourcePath[0]) {
    case DEVICE_SOURCE_HANDLES.pairingCode:
      return node.pairingCode;
    case DEVICE_SOURCE_HANDLES.qrCode:
      return deviceQrImageValue(node.id, node.pairingCode);
    default:
      return undefined;
  }
}

/**
 * Runs created before Source defaults were materialized contain the generic Type defaults.
 * Treat that exact snapshot as uninitialized so a deployment does not blank an existing Run.
 */
function isLegacyDefault(
  source: SourceNode | undefined,
  designValue: unknown,
  runtimeValue: unknown,
  shapes: ShowGraph["shapes"],
): boolean {
  if (!source || runtimeValue === undefined) return false;
  const baseline = defaultValueForType(source.type, shapes ?? []);
  const runtimeJson = JSON.stringify(runtimeValue);
  return (
    runtimeJson !== undefined &&
    runtimeJson === JSON.stringify(baseline) &&
    runtimeJson !== JSON.stringify(designValue)
  );
}
/** Resolves graph values onto one Scene's Variables through wiring. */
export function sceneVariableValues(
  graph: ShowGraph,
  sceneId: string,
  sourceValues: SourceValues,
): Record<string, unknown> {
  const designTimeSourceValues = defaultSourceValues(graph);
  const resolvedSourceValues: SourceValues = {};
  for (const node of graph.nodes) {
    if (node.kind !== "source") continue;
    const designValue = designTimeSourceValues[node.id];
    const runtimeValue = sourceValues[node.id];
    resolvedSourceValues[node.id] = isLegacyDefault(node, designValue, runtimeValue, graph.shapes)
      ? designValue
      : mergeRuntimeValue(designValue, runtimeValue);
  }

  const wiringEdges = graph.edges.filter((edge): edge is WiringEdge => edge.kind === "wiring");
  const resolvedNodes = new Set<string>();
  const resolvingNodes = new Set<string>();
  const resolveValue = (nodeId: string, sourcePath: readonly string[] = []): unknown => {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return undefined;
    if (node.kind === "device") return deviceValue(node, sourcePath);
    if (node.kind !== "source") return undefined;
    if (resolvedNodes.has(nodeId)) return valueAtPath(resolvedSourceValues[nodeId], sourcePath);
    if (resolvingNodes.has(nodeId)) return undefined;

    resolvingNodes.add(nodeId);
    let value = resolvedSourceValues[nodeId];
    for (const edge of wiringEdges) {
      if (edge.targetId !== nodeId) continue;
      const sourceValue = resolveValue(edge.sourceId, edge.sourcePath);
      if (sourceValue === undefined) continue;
      value = mergeRuntimeValue(value, remapFields(sourceValue, fieldMappingFor(graph, edge)));
    }
    resolvedSourceValues[nodeId] = value;
    resolvingNodes.delete(nodeId);
    resolvedNodes.add(nodeId);
    return valueAtPath(value, sourcePath);
  };

  const values: Record<string, unknown> = {};
  for (const edge of wiringEdges) {
    if (edge.targetId !== sceneId) continue;
    const [variableId, ...variablePath] = edge.targetPath;
    if (!variableId) continue;

    const sourceValue = resolveValue(edge.sourceId, edge.sourcePath);
    if (sourceValue === undefined) continue;
    values[variableId] = assignAtPath(
      values[variableId],
      variablePath,
      remapFields(sourceValue, fieldMappingFor(graph, edge)),
    );
  }
  return values;
}

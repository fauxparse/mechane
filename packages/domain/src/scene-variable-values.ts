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
import { applyWiringConversion, convertedSourceType } from "./wiring-conversion";

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
function appendArrayValues(current: unknown, incoming: unknown): unknown[] {
  const existing = Array.isArray(current) ? current : [];
  const values = Array.isArray(incoming) ? incoming : [incoming];
  return [...existing, ...values];
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
  const producer = producerType(graph, edge);
  // A conversion edge maps the fields of the item it selects, not of the
  // array it selects from (#532).
  const from = producer ? convertedSourceType(producer, edge.conversion) : null;
  const to = targetType(graph, edge);
  if (!from || !to) return undefined;
  const mapping = resolveShapeFieldMapping(from, to, graph.shapes ?? []);
  return Object.keys(mapping).length > 0 ? mapping : undefined;
}

/** What can go wrong carrying a value down a wiring edge, for an operator. */
export const WIRING_DIAGNOSTIC_CATEGORIES = [
  "emptyConversionSource",
  "invalidConversionSource",
] as const;

export type WiringDiagnosticCategory = (typeof WIRING_DIAGNOSTIC_CATEGORIES)[number];

/**
 * A structured explanation of a wiring edge that carried nothing.
 *
 * Absence on its own is indistinguishable from "nothing is wired here", so a
 * conversion that finds no item says so rather than letting the target quietly
 * fall back to its own default (#532).
 */
export interface WiringDiagnostic {
  readonly category: WiringDiagnosticCategory;
  readonly edgeId: string;
  readonly message: string;
}

export interface SceneVariableResolution {
  readonly values: Record<string, unknown>;
  readonly diagnostics: readonly WiringDiagnostic[];
}

/**
 * The value this edge delivers, or `undefined` for typed absence — pushing a
 * diagnostic when a declared conversion is the reason nothing arrived.
 */
function carriedValue(
  graph: ShowGraph,
  edge: WiringEdge,
  value: unknown,
  diagnostics: WiringDiagnostic[],
): unknown {
  if (!edge.conversion) return value;
  const result = applyWiringConversion(value, edge.conversion);
  if (!result.ok) {
    diagnostics.push({
      category: result.failure === "empty" ? "emptyConversionSource" : "invalidConversionSource",
      edgeId: edge.id,
      message:
        result.failure === "empty"
          ? "This connection takes the first item of a list that is empty, so nothing is fed."
          : "This connection takes the first item of a value that is not a list, so nothing is fed.",
    });
    return undefined;
  }
  return result.value;
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
/**
 * One pass of graph value resolution, shared by every reader.
 *
 * `resolveValue` memoizes each Source as it goes, so asking for the same
 * node twice costs nothing and its incoming edges are diagnosed once.
 */
function resolveGraph(
  graph: ShowGraph,
  sourceValues: SourceValues,
): {
  wiringEdges: readonly WiringEdge[];
  diagnostics: WiringDiagnostic[];
  resolveValue: (nodeId: string, sourcePath?: readonly string[]) => unknown;
} {
  const diagnostics: WiringDiagnostic[] = [];
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
    const incomingEdges = wiringEdges.filter((edge) => edge.targetId === nodeId);
    const assemblesArray =
      typeof node.type !== "string" && node.type.kind === "array" && incomingEdges.length > 0;
    let value = assemblesArray ? [] : resolvedSourceValues[nodeId];
    for (const edge of incomingEdges) {
      const producedValue = resolveValue(edge.sourceId, edge.sourcePath);
      if (producedValue === undefined) continue;
      const sourceValue = carriedValue(graph, edge, producedValue, diagnostics);
      if (sourceValue === undefined) continue;
      const incomingValue = remapFields(sourceValue, fieldMappingFor(graph, edge));
      value = assemblesArray
        ? appendArrayValues(value, incomingValue)
        : mergeRuntimeValue(value, incomingValue);
    }
    resolvedSourceValues[nodeId] = value;
    resolvingNodes.delete(nodeId);
    resolvedNodes.add(nodeId);
    return valueAtPath(value, sourcePath);
  };

  return { wiringEdges, diagnostics, resolveValue };
}

/** One entry per edge: the same edge cannot fail two different ways at once. */
function byEdge(diagnostics: readonly WiringDiagnostic[]): WiringDiagnostic[] {
  const seen = new Map<string, WiringDiagnostic>();
  for (const diagnostic of diagnostics) {
    if (!seen.has(diagnostic.edgeId)) seen.set(diagnostic.edgeId, diagnostic);
  }
  return [...seen.values()];
}

/** Resolves graph values onto one Scene's Variables through wiring. */
export function sceneVariableValues(
  graph: ShowGraph,
  sceneId: string,
  sourceValues: SourceValues,
): Record<string, unknown> {
  return sceneVariableResolution(graph, sceneId, sourceValues).values;
}

/**
 * The same resolution, plus the diagnostics raised on the way to this Scene.
 *
 * The renderer only wants the values, which is what `sceneVariableValues`
 * above returns; a surface that reports on wiring wants both.
 */
export function sceneVariableResolution(
  graph: ShowGraph,
  sceneId: string,
  sourceValues: SourceValues,
): SceneVariableResolution {
  const { wiringEdges, diagnostics, resolveValue } = resolveGraph(graph, sourceValues);
  const values: Record<string, unknown> = {};
  for (const edge of wiringEdges) {
    if (edge.targetId !== sceneId) continue;
    const [variableId, ...variablePath] = edge.targetPath;
    if (!variableId) continue;

    const producedValue = resolveValue(edge.sourceId, edge.sourcePath);
    if (producedValue === undefined) continue;
    const sourceValue = carriedValue(graph, edge, producedValue, diagnostics);
    if (sourceValue === undefined) continue;
    values[variableId] = assignAtPath(
      values[variableId],
      variablePath,
      remapFields(sourceValue, fieldMappingFor(graph, edge)),
    );
  }
  return { values, diagnostics: byEdge(diagnostics) };
}

/**
 * Every wiring edge in the graph that carries nothing, and why.
 *
 * The Show Editor draws the whole graph rather than one Scene, so it asks
 * about every edge at once — including edges between Sources, which no single
 * Scene's resolution necessarily reaches.
 */
export function wiringDiagnostics(
  graph: ShowGraph,
  sourceValues: SourceValues,
): readonly WiringDiagnostic[] {
  const { wiringEdges, diagnostics, resolveValue } = resolveGraph(graph, sourceValues);
  for (const edge of wiringEdges) {
    const producedValue = resolveValue(edge.sourceId, edge.sourcePath);
    if (producedValue === undefined) continue;
    carriedValue(graph, edge, producedValue, diagnostics);
  }
  return byEdge(diagnostics);
}

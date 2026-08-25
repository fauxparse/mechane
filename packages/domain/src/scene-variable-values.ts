import type { ShowGraph, SourceNode } from "./graph";
import {
  defaultSourceValues,
  defaultValueForType,
  propagateSourceWiring,
  type SourceValues,
} from "./source-defaults";

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
function mapWiringValue(
  value: unknown,
  fieldMapping: Readonly<Record<string, string>> | undefined,
): unknown {
  if (
    !fieldMapping ||
    Object.keys(fieldMapping).length === 0 ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return value;
  }
  const source = value as Record<string, unknown>;
  const mapped: Record<string, unknown> = {};
  for (const [sourceFieldId, targetFieldId] of Object.entries(fieldMapping)) {
    if (Object.prototype.hasOwnProperty.call(source, sourceFieldId)) {
      mapped[targetFieldId] = source[sourceFieldId];
    }
  }
  return mapped;
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
/** Resolves Source values onto one Scene's Variables through Show wiring. */
export function sceneVariableValues(
  graph: ShowGraph,
  sceneId: string,
  sourceValues: SourceValues,
): Record<string, unknown> {
  const designTimeSourceValues = defaultSourceValues(graph);
  const sourceIds = new Set([...Object.keys(designTimeSourceValues), ...Object.keys(sourceValues)]);
  const resolvedSourceValues: SourceValues = {};
  for (const sourceId of sourceIds) {
    const source = graph.nodes.find(
      (node): node is SourceNode => node.kind === "source" && node.id === sourceId,
    );
    const designValue = designTimeSourceValues[sourceId];
    const runtimeValue = sourceValues[sourceId];
    resolvedSourceValues[sourceId] = isLegacyDefault(
      source,
      designValue,
      runtimeValue,
      graph.shapes,
    )
      ? designValue
      : mergeRuntimeValue(designValue, runtimeValue);
  }
  propagateSourceWiring(graph, resolvedSourceValues);
  const values: Record<string, unknown> = {};
  for (const edge of graph.edges) {
    if (edge.kind !== "wiring" || edge.targetId !== sceneId) continue;
    const [variableId, ...variablePath] = edge.targetPath;
    if (!variableId) continue;

    const sourceValue = mapWiringValue(
      valueAtPath(resolvedSourceValues[edge.sourceId], edge.sourcePath),
      edge.fieldMapping,
    );
    if (sourceValue === undefined) continue;
    values[variableId] = assignAtPath(values[variableId], variablePath, sourceValue);
  }
  return values;
}

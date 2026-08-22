import type { ShowGraph } from "./graph";
import { defaultSourceValues, type SourceValues } from "./source-defaults";

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
    resolvedSourceValues[sourceId] = mergeRuntimeValue(
      designTimeSourceValues[sourceId],
      sourceValues[sourceId],
    );
  }
  const values: Record<string, unknown> = {};
  for (const edge of graph.edges) {
    if (edge.kind !== "wiring" || edge.targetId !== sceneId) continue;
    const [variableId, ...variablePath] = edge.targetPath;
    if (!variableId) continue;

    const sourceValue = valueAtPath(resolvedSourceValues[edge.sourceId], edge.sourcePath);
    if (sourceValue === undefined) continue;
    values[variableId] = assignAtPath(values[variableId], variablePath, sourceValue);
  }
  return values;
}

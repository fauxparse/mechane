import type { ShowGraph } from "./graph";
import type { SourceValues } from "./source-defaults";

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

/** Resolves Source values onto one Scene's Variables through Show wiring. */
export function sceneVariableValues(
  graph: ShowGraph,
  sceneId: string,
  sourceValues: SourceValues,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const edge of graph.edges) {
    if (edge.kind !== "wiring" || edge.targetId !== sceneId) continue;
    const [variableId, ...variablePath] = edge.targetPath;
    if (!variableId) continue;

    const sourceValue = valueAtPath(sourceValues[edge.sourceId], edge.sourcePath);
    if (sourceValue === undefined) continue;
    values[variableId] = assignAtPath(values[variableId], variablePath, sourceValue);
  }
  return values;
}

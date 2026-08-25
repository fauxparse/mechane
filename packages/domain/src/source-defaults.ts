import type { GraphNode, ShowGraph, SourceFieldDefault, SourceNode } from "./graph";
import type { Shape, ShapeField, Type } from "./shapes";

/** Live Source values at the start of a Run, keyed by Source node id. */
export type SourceValues = Record<string, unknown>;

function primitiveDefault(type: Type): unknown {
  if (typeof type !== "string") return type.kind === "array" ? [] : null;
  switch (type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "text":
    case "image":
    case "color":
    case "date":
    case "datetime":
      return "";
  }
}

export function defaultValueForType(type: Type, shapes: readonly Shape[] = []): unknown {
  if (typeof type === "string") return primitiveDefault(type);
  if (type.kind === "array") return [];
  const shape = shapes.find((candidate) => candidate.id === type.shapeId);
  if (!shape) return null;
  return Object.fromEntries(
    shape.fields.map((field) => [field.id, defaultForField(field, shapes)]),
  );
}

function defaultForField(field: ShapeField, shapes: readonly Shape[]): unknown {
  if (field.defaultValue !== null && field.defaultValue !== undefined) return field.defaultValue;
  return field.required ? defaultValueForType(field.type, shapes) : null;
}

export function setValueAtPath(value: unknown, path: readonly string[], next: unknown): unknown {
  if (path.length === 0) return next;
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const [segment, ...rest] = path;
  if (segment === undefined) return value;
  return {
    ...(value as Record<string, unknown>),
    [segment]: setValueAtPath((value as Record<string, unknown>)[segment], rest, next),
  };
}

function applyOverride(value: unknown, path: readonly string[], next: unknown): unknown {
  return setValueAtPath(value, path, next);
}

function applySourceOverrides(
  value: unknown,
  overrides: Iterable<{ fieldPath: readonly string[]; value: unknown }>,
): unknown {
  let result = value;
  for (const override of overrides)
    result = applyOverride(result, override.fieldPath, override.value);
  return result;
}

export function sourceDefaultsFor(
  graph: Pick<ShowGraph, "sourceFieldDefaults">,
  nodeId: string,
): SourceFieldDefault[] {
  return (graph.sourceFieldDefaults ?? []).filter((override) => override.nodeId === nodeId);
}

function sourceValue(source: SourceNode, graph: ShowGraph): unknown {
  const value = defaultValueForType(source.type, graph.shapes ?? []);
  return applySourceOverrides(value, sourceDefaultsFor(graph, source.id));
}

/**
 * Materialises every Source's design-time defaults for a newly-started Run.
 * The published graph is the source of truth: draft-only changes must not
 * affect live data until they are published.
 */
export function defaultSourceValues(graph: ShowGraph): SourceValues {
  const values: SourceValues = {};
  for (const node of graph.nodes) {
    if (node.kind === "source") values[node.id] = sourceValue(node, graph);
  }
  propagateSourceWiring(graph, values);
  return values;
}
function valueAtPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
    if (!(segment in current)) return undefined;
    current = Reflect.get(current, segment);
  }
  return current;
}

export function propagateSourceWiring(graph: ShowGraph, values: SourceValues): void {
  const resolving = new Set<string>();
  const resolved = new Set<string>();
  const resolve = (sourceId: string): void => {
    if (resolved.has(sourceId) || resolving.has(sourceId)) return;
    resolving.add(sourceId);
    for (const edge of graph.edges) {
      if (edge.kind !== "wiring" || edge.targetId !== sourceId) continue;
      const producer = graph.nodes.find((node) => node.id === edge.sourceId);
      if (producer?.kind !== "source") continue;
      resolve(producer.id);
      const sourceValue = valueAtPath(values[producer.id], edge.sourcePath);
      if (sourceValue !== undefined) {
        values[sourceId] = setValueAtPath(values[sourceId], edge.targetPath, sourceValue);
      }
    }
    resolving.delete(sourceId);
    resolved.add(sourceId);
  };
  for (const node of graph.nodes) {
    if (node.kind === "source") resolve(node.id);
  }
}

/** Narrowing helper for callers iterating a graph's nodes. */
export function sourceNodes(graph: ShowGraph): SourceNode[] {
  return graph.nodes.filter((node): node is GraphNode & SourceNode => node.kind === "source");
}

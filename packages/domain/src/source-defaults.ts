import type { GraphNode, ShowGraph, SourceNode } from "./graph";
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
  if (type.kind === "object") return {};
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

function sourceValue(source: SourceNode, graph: ShowGraph): unknown {
  const value = defaultValueForType(source.type, graph.shapes ?? []);
  const overrides = new Map(
    (source.fieldDefaults ?? []).map(
      (override) => [override.fieldPath.join("\u0000"), override] as const,
    ),
  );
  for (const override of graph.sourceFieldDefaults ?? []) {
    if (override.nodeId === source.id) {
      overrides.set(override.fieldPath.join("\u0000"), override);
    }
  }
  return applySourceOverrides(value, overrides.values());
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
  return values;
}

/** Narrowing helper for callers iterating a graph's nodes. */
export function sourceNodes(graph: ShowGraph): SourceNode[] {
  return graph.nodes.filter((node): node is GraphNode & SourceNode => node.kind === "source");
}

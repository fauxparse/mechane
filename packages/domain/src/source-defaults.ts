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

function setPath(root: Record<string, unknown>, path: readonly string[], value: unknown): void {
  if (path.length === 0) return;
  let current = root;
  for (const segment of path.slice(0, -1)) {
    const next = current[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) return;
    current = next as Record<string, unknown>;
  }
  const last = path[path.length - 1];
  if (last !== undefined) current[last] = value;
}

function sourceValue(source: SourceNode, graph: ShowGraph): unknown {
  const value = defaultValueForType(source.type, graph.shapes ?? []);
  const root =
    value && typeof value === "object" && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : null;
  const overrides = new Map(
    (graph.sourceFieldDefaults ?? [])
      .filter((override) => override.nodeId === source.id)
      .map((override) => [override.fieldPath.join("\u0000"), override] as const),
  );
  for (const override of source.fieldDefaults ?? []) {
    overrides.set(override.fieldPath.join("\u0000"), {
      nodeId: source.id,
      fieldPath: override.fieldPath,
      value: override.value,
    });
  }
  if (!root) return value;
  for (const override of overrides.values()) setPath(root, override.fieldPath, override.value);
  return root;
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

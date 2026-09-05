import type { GraphNode, ShowGraph, SourceFieldDefault, SourceNode } from "./graph";
import type { Shape, ShapeField, Type } from "./shapes";
import {
  isArrayStructuredValueTemplate,
  isShapeStructuredValueTemplate,
  normalizeStructuredValueTemplate,
  resolveStructuredValueTemplate,
  type StructuredValueTemplate,
} from "./structured-values";

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
  const [segment, ...rest] = path;
  if (segment === undefined) return next;
  if (isShapeStructuredValueTemplate(value)) {
    return {
      ...value,
      fields: {
        ...value.fields,
        [segment]: setValueAtPath(value.fields[segment], rest, next) as StructuredValueTemplate,
      },
    };
  }
  if (isArrayStructuredValueTemplate(value)) {
    const index = Number(segment);
    if (!Number.isInteger(index) || index < 0 || index >= value.items.length) return value;
    return {
      ...value,
      items: value.items.map((item, itemIndex) =>
        itemIndex === index ? (setValueAtPath(item, rest, next) as StructuredValueTemplate) : item,
      ),
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
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

function sourceValueTemplate(source: SourceNode, graph: ShowGraph): StructuredValueTemplate {
  const value = defaultValueForType(source.type, graph.shapes ?? []);
  const withOverrides = applySourceOverrides(value, sourceDefaultsFor(graph, source.id));
  return normalizeStructuredValueTemplate(withOverrides, source.type, graph.shapes ?? []);
}

/** Materialises every Source's nested authored template. */
export function defaultSourceValueTemplates(
  graph: ShowGraph,
): Record<string, StructuredValueTemplate> {
  const values: Record<string, StructuredValueTemplate> = {};
  for (const node of graph.nodes) {
    if (node.kind === "source") values[node.id] = sourceValueTemplate(node, graph);
  }
  return values;
}

/** Returns expanded design-time values for graph planning and previews. */
export function defaultSourceValues(graph: ShowGraph): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(defaultSourceValueTemplates(graph)).map(([sourceId, value]) => [
      sourceId,
      resolveStructuredValueTemplate(value),
    ]),
  );
}

/** Narrowing helper for callers iterating a graph's nodes. */
export function sourceNodes(graph: ShowGraph): SourceNode[] {
  return graph.nodes.filter((node): node is GraphNode & SourceNode => node.kind === "source");
}

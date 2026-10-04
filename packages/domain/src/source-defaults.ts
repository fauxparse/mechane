import { generateId } from "./id";
import type { GraphNode, ShowGraph, SourceFieldDefault, SourceNode } from "./graph";
import type { Shape, Type } from "./shapes";
import {
  isArrayStructuredValueTemplate,
  isShapeStructuredValueTemplate,
  materializeStructuredValue,
  normalizeStructuredValueTemplate,
  resolveStructuredValueTemplate,
  type RuntimeValue,
  type StructuredValueTemplate,
  type StructuredValues,
} from "./structured-values";

function primitiveDefault(type: Type): unknown {
  if (typeof type !== "string") return type.kind === "array" ? [] : null;
  switch (type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "image":
      // Image values are asset references; only typed absence (null) is a
      // valid empty default, matching assertValueConformsToType.
      return null;
    case "text":
    case "color":
    case "date":
    case "datetime":
      return "";
  }
}

export function defaultValueForType(type: Type, shapes: readonly Shape[] = []): unknown {
  if (typeof type === "string") return primitiveDefault(type);
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  let result: unknown = null;
  const pending: Array<{ type: Type; emit: (value: unknown) => void }> = [
    {
      type,
      emit: (value) => {
        result = value;
      },
    },
  ];
  while (pending.length > 0) {
    const slot = pending.pop()!;
    if (typeof slot.type === "string") {
      slot.emit(primitiveDefault(slot.type));
      continue;
    }
    if (slot.type.kind === "array") {
      slot.emit([]);
      continue;
    }
    const shape = byId.get(slot.type.shapeId);
    if (!shape) {
      slot.emit(null);
      continue;
    }
    const fields: Record<string, unknown> = Object.create(null);
    slot.emit(fields);
    for (let index = shape.fields.length - 1; index >= 0; index -= 1) {
      const field = shape.fields[index]!;
      if (field.defaultValue !== null && field.defaultValue !== undefined)
        fields[field.id] = field.defaultValue;
      else if (!field.required) fields[field.id] = null;
      else
        pending.push({
          type: field.type,
          emit: (value) => {
            fields[field.id] = value;
          },
        });
    }
  }
  return result;
}

export function setValueAtPath(
  value: unknown,
  path: readonly string[],
  next: unknown,
  forkContainers = false,
): unknown {
  const parents: Array<{
    value: Record<string, unknown> | Extract<StructuredValueTemplate, { kind: "shape" | "array" }>;
    segment: string;
  }> = [];
  let current = value;
  for (const segment of path) {
    if (typeof current !== "object" || current === null) return value;
    if (isShapeStructuredValueTemplate(current)) {
      parents.push({ value: current, segment });
      current = current.fields[segment];
    } else if (isArrayStructuredValueTemplate(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.items.length) return value;
      parents.push({ value: current, segment });
      current = current.items[index];
    } else if (!Array.isArray(current)) {
      const object = current as Record<string, unknown>;
      parents.push({ value: object, segment });
      current = object[segment];
    } else return value;
  }
  let result = next;
  for (let index = parents.length - 1; index >= 0; index -= 1) {
    const parent = parents[index]!;
    if (isShapeStructuredValueTemplate(parent.value)) {
      result = {
        ...parent.value,
        id: forkContainers ? generateId("structuredValue") : parent.value.id,
        fields: { ...parent.value.fields, [parent.segment]: result },
      };
    } else if (isArrayStructuredValueTemplate(parent.value)) {
      const items = [...parent.value.items];
      items[Number(parent.segment)] = result as StructuredValueTemplate;
      result = {
        ...parent.value,
        id: forkContainers ? generateId("structuredValue") : parent.value.id,
        items,
      };
    } else result = { ...parent.value, [parent.segment]: result };
  }
  return result;
}

function applySourceOverrides(
  value: unknown,
  overrides: Iterable<{ fieldPath: readonly string[]; value: unknown }>,
): unknown {
  let result = value;
  for (const override of overrides)
    result = setValueAtPath(result, override.fieldPath, override.value, true);
  return result;
}

export function sourceDefaultsFor(
  graph: Pick<ShowGraph, "sourceFieldDefaults">,
  nodeId: string,
): SourceFieldDefault[] {
  return (graph.sourceFieldDefaults ?? []).filter((override) => override.nodeId === nodeId);
}

export function defaultSourceValueTemplate(
  source: SourceNode,
  graph: ShowGraph,
): StructuredValueTemplate {
  const value = defaultValueForType(source.type, graph.shapes ?? []);
  const withOverrides = applySourceOverrides(
    value,
    sourceDefaultsFor(graph, source.id).sort(
      (left, right) => left.fieldPath.length - right.fieldPath.length,
    ),
  );
  return normalizeStructuredValueTemplate(withOverrides, source.type, graph.shapes ?? []);
}

/** Materialises every Source's nested authored template. */
export function defaultSourceValueTemplates(
  graph: ShowGraph,
): Record<string, StructuredValueTemplate> {
  const values: Record<string, StructuredValueTemplate> = {};
  for (const node of graph.nodes) {
    if (node.kind === "source") values[node.id] = defaultSourceValueTemplate(node, graph);
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

export interface SourceRuntimeState {
  /** One entry per Source node, structured values carried as references. */
  readonly values: Record<string, RuntimeValue>;
  readonly structuredValues: StructuredValues;
}

/**
 * The same design-time defaults in reference form, with the records they point
 * at.
 *
 * `defaultSourceValues` inlines every structured value, which is what the
 * renderer and the wiring diagnostics want. Anything that evaluates a Formula
 * wants the reference domain instead, because that is the only form
 * `evaluateTransformer` reads (#668). Studio uses this to preview a Formula
 * against the values a Show actually carries before a Run exists.
 */
export function defaultSourceRuntimeState(graph: ShowGraph): SourceRuntimeState {
  const shapes = graph.shapes ?? [];
  const values: Record<string, RuntimeValue> = {};
  const structuredValues: StructuredValues = {};
  for (const node of graph.nodes) {
    if (node.kind !== "source") continue;
    const materialized = materializeStructuredValue(
      defaultSourceValueTemplate(node, graph),
      node.type,
      shapes,
    );
    values[node.id] = materialized.value;
    Object.assign(structuredValues, materialized.structuredValues);
  }
  return { values, structuredValues };
}

/** Narrowing helper for callers iterating a graph's nodes. */
export function sourceNodes(graph: ShowGraph): SourceNode[] {
  return graph.nodes.filter((node): node is GraphNode & SourceNode => node.kind === "source");
}

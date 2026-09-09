import type { Block } from "./blocks";
import type { Element, SlotElement, SlotInputSource } from "./canvas";
import type { SceneVariable, ShowGraph } from "./graph";
import type { RuntimeEventParameterPlan } from "./interactions";
import { valueAtPath } from "./property-values";
import { sceneVariableValues } from "./scene-variable-values";
import { expandSlotSource, type SlotVariableValue } from "./slots";
import {
  isStructuredValueReference,
  type RunState,
  type StructuredValues,
} from "./structured-values";

export type CueParameterFailure =
  | "missing-scene"
  | "missing-slot-element"
  | "missing-block"
  | "invalid-expansion-source"
  | "slot-index-out-of-range";

export type CueParameterResolution =
  | { readonly kind: "resolved"; readonly values: Readonly<Record<string, unknown>> }
  | { readonly kind: "failed"; readonly reason: CueParameterFailure };

export interface ResolveCueParametersInput {
  readonly graph: ShowGraph;
  /** The Scene Canvas the Event was observed on. */
  readonly canvas: { readonly root: Element };
  readonly sceneId: string;
  /**
   * Composed Show and Instance state, with references intact. A relayed
   * structured Parameter carries the reference it was rendered from, so a
   * denormalized view of the same state would resolve to a detached copy.
   */
  readonly state: RunState;
  readonly blocks: readonly Block[];
  readonly parameters: RuntimeEventParameterPlan;
}

/**
 * The values a resolved Cue's Parameters take for one observed Event.
 *
 * Walks the Slot instance path the Player reported, rebuilding each Block
 * instance's Variables the way the renderer did — but reading raw values
 * rather than coerced ones, because a Parameter carrying a Shape carries its
 * reference and `resolveSlotInputs` would copy it.
 *
 * Pure, so the Player and the server compute the same values from the same
 * state, the way `planUpdate` already does for writes.
 */
export function resolveCueParameters(input: ResolveCueParametersInput): CueParameterResolution {
  const scene = input.graph.nodes.find(
    (node) => node.id === input.sceneId && node.kind === "scene",
  );
  if (!scene || scene.kind !== "scene") return { kind: "failed", reason: "missing-scene" };

  let variables = sceneEnvironment(input.graph, input.sceneId, input.state, scene.variables);
  let root = input.canvas.root;
  let item: unknown;

  for (const segment of input.parameters.instancePath) {
    const slot = findElement(root, segment.slotElementId);
    if (!slot || slot.type !== "slot") {
      return { kind: "failed", reason: "missing-slot-element" };
    }
    const block = input.blocks.find((candidate) => candidate.id === slot.blockId);
    if (!block) return { kind: "failed", reason: "missing-block" };
    const expansion = expansionItem(slot, variables, item, input.state, segment.index);
    if (expansion.kind === "failed") return expansion;
    item = expansion.item;
    variables = blockEnvironment(block, slot, variables, item, input.state.structuredValues);
    root = block.canvas.root;
  }

  let values: Record<string, unknown> = {};
  for (const mapping of input.parameters.bindingMappings) {
    values[mapping.parameterId] = sourceValue(
      mapping.source,
      variables,
      item,
      input.state.structuredValues,
    );
  }
  for (const hop of input.parameters.hops) {
    const relayed: Record<string, unknown> = {};
    for (const mapping of hop) {
      relayed[mapping.targetParameterId] = valueAtReferencePath(
        values[mapping.sourceParameterId],
        mapping.sourceFieldPath ?? [],
        input.state.structuredValues,
      );
    }
    values = relayed;
  }
  return { kind: "resolved", values };
}

/**
 * The Scene's Variables over raw Source values.
 *
 * `sceneVariableValues` is given `state.sourceValues` directly rather than a
 * resolved view: wiring an array Source into a Variable carries the array's
 * reference, and that reference is what the Slot below expands.
 */
function sceneEnvironment(
  graph: ShowGraph,
  sceneId: string,
  state: RunState,
  sceneVariables: readonly SceneVariable[],
): readonly SlotVariableValue[] {
  const values = sceneVariableValues(graph, sceneId, state.sourceValues);
  return sceneVariables.flatMap((variable): SlotVariableValue[] =>
    variable.type
      ? [
          {
            id: variable.id,
            type: variable.type,
            value: values[variable.id] === undefined ? variable.defaultValue : values[variable.id],
          },
        ]
      : [],
  );
}

/** One Block instance's Variables, assigned from the Slot without coercion. */
function blockEnvironment(
  block: Block,
  slot: SlotElement,
  outer: readonly SlotVariableValue[],
  item: unknown,
  structuredValues: StructuredValues,
): readonly SlotVariableValue[] {
  const assignments = slot.assignments ?? [];
  return block.variables.map((variable) => {
    const assignment = assignments.find((candidate) => candidate.variableId === variable.id);
    const value = assignment
      ? sourceValue(assignment.source, outer, item, structuredValues)
      : undefined;
    return {
      id: variable.id,
      type: variable.type,
      value: value === undefined || value === null ? variable.defaultValue : value,
    };
  });
}

/** The raw expansion item one Slot instance was rendered from. */
function expansionItem(
  slot: SlotElement,
  variables: readonly SlotVariableValue[],
  item: unknown,
  state: RunState,
  index: number,
):
  | { readonly kind: "item"; readonly item: unknown }
  | { readonly kind: "failed"; readonly reason: CueParameterFailure } {
  const source = slot.expansion?.source;
  // An unexpanded Slot renders exactly one instance, and its Block reads the
  // Slot's assignments against the Canvas above rather than an item.
  if (!source) {
    return index === 0
      ? { kind: "item", item: undefined }
      : { kind: "failed", reason: "slot-index-out-of-range" };
  }
  const value = sourceValue(source, variables, item, state.structuredValues);
  const record = isStructuredValueReference(value) ? state.structuredValues[value.ref] : undefined;
  const expanded = expandSlotSource(record?.kind === "array" ? record.items : value);
  if (expanded.diagnostic) return { kind: "failed", reason: "invalid-expansion-source" };
  if (index >= expanded.items.length) {
    return { kind: "failed", reason: "slot-index-out-of-range" };
  }
  return { kind: "item", item: expanded.items[index] };
}

/**
 * The raw value a Slot input source names: no coercion, and dereferencing only
 * where a field path has to pass through a reference to continue.
 *
 * `resolveSlotInputs` reads the same sources and then coerces, because a
 * renderer wants a value it can paint. A Cue Parameter wants the opposite —
 * the reference is the thing being carried, and copying it would detach the
 * write that follows from the record the author pointed at.
 */
function sourceValue(
  source: SlotInputSource,
  variables: readonly SlotVariableValue[],
  item: unknown,
  structuredValues: StructuredValues,
): unknown {
  if (source.kind === "literal") return source.value;
  if (source.kind === "unset") return undefined;
  const base =
    source.kind === "runtimeItem"
      ? item
      : variables.find((candidate) => candidate.id === source.variableId)?.value;
  return valueAtReferencePath(base, source.fieldPath ?? [], structuredValues);
}

/**
 * Walks a field path that may cross Structured Value records, keeping the
 * value at each step in the form it was stored in. An empty path is the
 * identity, which is how a whole Shape stays a reference.
 */
function valueAtReferencePath(
  value: unknown,
  path: readonly string[],
  structuredValues: StructuredValues,
): unknown {
  let current = value;
  for (const fieldId of path) {
    if (isStructuredValueReference(current)) {
      const record = structuredValues[current.ref];
      if (!record || record.kind !== "shape") return undefined;
      if (!Object.prototype.hasOwnProperty.call(record.fields, fieldId)) return undefined;
      current = record.fields[fieldId];
      continue;
    }
    current = valueAtPath(current, [fieldId]);
    if (current === undefined) return undefined;
  }
  return current;
}

function findElement(root: Element, elementId: string): Element | undefined {
  if (root.id === elementId) return root;
  if (root.type !== "frame" && root.type !== "slot") return undefined;
  for (const child of root.children ?? []) {
    const found = findElement(child, elementId);
    if (found) return found;
  }
  return undefined;
}

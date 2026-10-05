import type {
  Cue,
  CueParameter,
  ParameterMapping,
  SlotEventBinding,
} from "@mechane/domain/interactions";
import { typeAtPath } from "@mechane/domain/property-values";
import type { Shape, Type } from "@mechane/domain/shapes";

/**
 * Slot Event Binding authoring rules: which owner Cues a Block Cue can relay
 * into, and the parameter mappings that keep the relayed values intact.
 *
 * A relay hands values through untouched (`resolveCueParameters` copies
 * references and never coerces), so a mapping is only sound when the source
 * and target Types are exactly equal. A coercion-friendly pair such as
 * number→text would silently change what the target Cue receives, so those
 * are rejected here rather than offered.
 */

/**
 * Whether two Types are the same Type, structurally. `areTypesCompatible`
 * answers a different question — whether a coerced assignment exists — which
 * is precisely what a relay must not do.
 */
function typesEqual(left: Type, right: Type): boolean {
  if (left === right) return true;
  if (typeof left === "string" || typeof right === "string") return false;
  if (left.kind !== right.kind) return false;
  if (left.kind === "shape") {
    return right.kind === "shape" && left.shapeId === right.shapeId;
  }
  return right.kind === "array" && typesEqual(left.of, right.of);
}

/** A Cue's parameters in authored order, empty when it takes none. */
function parametersOf(cue: Cue): readonly CueParameter[] {
  return (cue.parameters ?? [])
    .slice()
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
}

/**
 * The Type a mapping hands its target: the source Parameter's own Type, or
 * the one its field path digs out of it. Null once the path stops resolving.
 */
function mappedSourceType(
  sourceParameter: CueParameter,
  mapping: ParameterMapping,
  shapes: readonly Shape[],
): Type | null {
  return mapping.sourceFieldPath === undefined
    ? sourceParameter.type
    : typeAtPath(sourceParameter.type, mapping.sourceFieldPath, shapes);
}

/** Whether a saved mapping still lines up with both Cues' current parameters. */
function mappingIsValid(
  sourceParameters: readonly CueParameter[],
  targetParameter: CueParameter,
  mapping: ParameterMapping,
  shapes: readonly Shape[],
): boolean {
  const sourceParameter = sourceParameters.find(
    (candidate) => candidate.id === mapping.sourceParameterId,
  );
  if (!sourceParameter) return false;
  const type = mappedSourceType(sourceParameter, mapping, shapes);
  return type !== null && typesEqual(type, targetParameter.type);
}

/**
 * The mappings that connect a source Cue's parameters to a target Cue's.
 *
 * Every target parameter must be mapped exactly once — that is the rule
 * `assertValidInteractions` enforces on save — so a target with a parameter
 * the source cannot supply is unmappable and returns null rather than a
 * mapping that would be rejected downstream. A target with no parameters
 * takes the empty mapping.
 *
 * Saved mappings survive while they remain valid, field paths included: no
 * automatic pass could re-derive the decision to hand a target one field of
 * a larger source value. Remaining parameters pair up first by equal name,
 * then by the unique leftover source parameter of the exact right Type.
 */
export function slotCueParameterMappings(
  source: Cue,
  target: Cue,
  shapes: readonly Shape[],
  existingMappings?: readonly ParameterMapping[],
): readonly ParameterMapping[] | null {
  const sourceParameters = parametersOf(source);
  const targetParameters = parametersOf(target);
  if (targetParameters.length === 0) return [];

  const assigned = new Map<string, ParameterMapping>();
  const usedSources = new Set<string>();

  for (const mapping of existingMappings ?? []) {
    const targetParameter = targetParameters.find(
      (candidate) => candidate.id === mapping.targetParameterId,
    );
    if (!targetParameter || assigned.has(targetParameter.id)) continue;
    if (!mappingIsValid(sourceParameters, targetParameter, mapping, shapes)) continue;
    assigned.set(targetParameter.id, mapping);
    usedSources.add(mapping.sourceParameterId);
  }

  for (const targetParameter of targetParameters) {
    if (assigned.has(targetParameter.id)) continue;
    const named = sourceParameters.find(
      (candidate) =>
        candidate.name === targetParameter.name &&
        !usedSources.has(candidate.id) &&
        typesEqual(candidate.type, targetParameter.type),
    );
    if (!named) continue;
    assigned.set(targetParameter.id, {
      sourceParameterId: named.id,
      targetParameterId: targetParameter.id,
    });
    usedSources.add(named.id);
  }

  for (const targetParameter of targetParameters) {
    if (assigned.has(targetParameter.id)) continue;
    const compatible = sourceParameters.filter(
      (candidate) =>
        !usedSources.has(candidate.id) && typesEqual(candidate.type, targetParameter.type),
    );
    if (compatible.length !== 1) continue;
    const [only] = compatible;
    if (!only) continue;
    assigned.set(targetParameter.id, {
      sourceParameterId: only.id,
      targetParameterId: targetParameter.id,
    });
    usedSources.add(only.id);
  }

  if (assigned.size !== targetParameters.length) return null;
  return targetParameters.flatMap((parameter) => {
    const mapping = assigned.get(parameter.id);
    return mapping ? [mapping] : [];
  });
}

/**
 * The retargeted Binding an author's picker choice produces, or null when the
 * chosen Cue cannot receive the source Cue's values. Identity, source, slot,
 * and position are the Binding's own, so a retarget never reorders, duplicates,
 * or drops the relay — only the destination and its mappings change.
 */
export function retargetSlotEventBinding(
  binding: SlotEventBinding,
  source: Cue,
  target: Cue,
  shapes: readonly Shape[],
): SlotEventBinding | null {
  const parameterMappings = slotCueParameterMappings(
    source,
    target,
    shapes,
    binding.parameterMappings,
  );
  return parameterMappings === null
    ? null
    : { ...binding, targetCueId: target.id, parameterMappings };
}

/** Field names along a field path, or null once the path stops resolving. */
export function fieldPathLabels(
  type: Type,
  fieldPath: readonly string[],
  shapes: readonly Shape[],
): string[] | null {
  const labels: string[] = [];
  let current: Type = type;
  for (const fieldId of fieldPath) {
    const shapeId =
      typeof current === "object" && current.kind === "shape" ? current.shapeId : null;
    const field = shapes
      .find((candidate) => candidate.id === shapeId)
      ?.fields.find((candidate) => candidate.id === fieldId);
    if (!field) return null;
    labels.push(field.name);
    current = field.type;
  }
  return labels;
}

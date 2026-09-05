// Positional array-to-single wiring (#532).
//
// The type rules in ./shapes let a single value widen into an array, but
// never the reverse: an `array<T>` producer and a `T` consumer are simply
// incompatible, because "which item?" has no answer the type system can give.
//
// This module gives one answer, and only one: position zero. It is
// deliberately *positional* rather than identity-preserving — reordering the
// producer's array changes which item travels down the edge — and it is
// deliberately *explicit*: the edge records the conversion it performs, the
// graph boundary validates that record, and an edge that carries an array
// into a single value without saying so stays invalid. There is no implicit
// exception anywhere for a validator to disagree about.
//
// After the item is taken, nothing here is special: the edge is judged by the
// ordinary element-to-target compatibility table in ./shapes, and the item
// travels exactly as it would down a direct edge from an element-typed
// producer — including the Property Coercion that consumes it downstream.

import { areTypesCompatible } from "./shapes";
import type { Shape, Type } from "./shapes";

/**
 * The conversions a wiring edge may declare. One for now; the list exists so
 * a second one is a row here rather than a new field on the edge.
 */
export const WIRING_CONVERSIONS = ["firstItem"] as const;

export type WiringConversion = (typeof WIRING_CONVERSIONS)[number];

export function isWiringConversion(value: string): value is WiringConversion {
  return (WIRING_CONVERSIONS as readonly string[]).includes(value);
}

function isArrayType(type: Type): type is { kind: "array"; of: Type } {
  return typeof type !== "string" && type.kind === "array";
}

/**
 * The type a conversion reads out of `from`, or null when the conversion
 * doesn't apply to that producer type at all.
 */
export function convertedSourceType(
  from: Type,
  conversion: WiringConversion | null | undefined,
): Type | null {
  if (!conversion) return from;
  return isArrayType(from) ? from.of : null;
}

/**
 * The conversion this producer/consumer pair needs, or null when it needs
 * none — either because the types already fit, or because no conversion
 * would make them fit.
 *
 * Only a *single* consumer gets a conversion. An array consumer already
 * accepts an array producer element-wise, and a single value already widens
 * into one, so neither has a "which item?" question to answer.
 */
export function requiredWiringConversion(
  from: Type,
  to: Type,
  shapes: readonly Shape[] = [],
): WiringConversion | null {
  if (areTypesCompatible(from, to, shapes)) return null;
  if (!isArrayType(from) || isArrayType(to)) return null;
  return areTypesCompatible(from.of, to, shapes) ? "firstItem" : null;
}

/**
 * Whether a wiring edge declaring `conversion` may carry `from` into `to`.
 *
 * This is the one compatibility question the whole graph asks about a wiring
 * edge, so validation, the derived edge facts, and the Source retype planner
 * cannot answer it differently.
 */
export function wiringTypesCompatible(
  from: Type,
  to: Type,
  conversion: WiringConversion | null | undefined,
  shapes: readonly Shape[] = [],
): boolean {
  if (!conversion) return areTypesCompatible(from, to, shapes);
  const element = convertedSourceType(from, conversion);
  // A declared conversion is not a fallback: an edge that says "first item"
  // about a producer that is not an array is wrong, not merely direct.
  return element !== null && !isArrayType(to) && areTypesCompatible(element, to, shapes);
}

/** Why a conversion produced no value. */
export type WiringConversionFailure = "notAnArray" | "empty";

export type WiringConversionResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly failure: WiringConversionFailure };

/**
 * Takes the converted value out of a producer value, or says why it can't.
 *
 * What comes out is the item itself, delivered exactly as a direct edge from
 * an element-typed producer would deliver it — the conversion selects, it
 * doesn't transform. Coercion stays where it already lives, at the Property
 * boundary that consumes the value.
 *
 * An empty array is a failure rather than a value: the target receives typed
 * absence and the operator receives a diagnostic. Substituting a later item,
 * or leaving whatever the target last held in place, would both be worse than
 * saying nothing — one is silently wrong, the other silently stale.
 */
export function applyWiringConversion(
  value: unknown,
  conversion: WiringConversion,
): WiringConversionResult {
  if (conversion !== "firstItem" || !Array.isArray(value)) {
    return { ok: false, failure: "notAnArray" };
  }
  if (value.length === 0) return { ok: false, failure: "empty" };
  return { ok: true, value: value[0] };
}

// PROTOTYPE (issue #712) — the percentage rules every variant shares.
//
// Nothing here is variant-specific: the unit a stored value carries, what a
// percentage is measured against, how one unit converts to the other, when a
// percentage is unavailable (#134's relative-sizing invariant), and what has to
// happen to a hugging parent's children. The variants differ only in the gesture.
import type { Element, SizeUnit, SizeValue } from "@mechane/domain";
import { isPropertyConnection } from "@mechane/domain";

import type { CanvasInspectorElementSizes } from "../canvas-inspector-types";

export type Axis = "width" | "height";

/** The unit a stored size carries, or null when it carries no literal at all. */
export const unitOf = (value: unknown): SizeUnit | null => {
  if (typeof value === "number") return "px";
  if (!value || typeof value !== "object" || isPropertyConnection(value)) return null;
  if (!("value" in value) || typeof value.value !== "number") return null;
  return "unit" in value && value.unit === "%" ? "%" : "px";
};

export const amountOf = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value || typeof value !== "object" || isPropertyConnection(value)) return null;
  if (!("value" in value) || typeof value.value !== "number") return null;
  return Number.isFinite(value.value) ? value.value : null;
};

export const sizeValueFor = (amount: number, unit: SizeUnit): SizeValue =>
  unit === "%" ? { value: amount, unit } : amount;

const round = (amount: number, places: number): number => {
  const factor = 10 ** places;
  return Math.round(amount * factor) / factor;
};

/**
 * px ⇄ % against a reference length. Without a reference (nothing measured yet)
 * the number survives unchanged, which is wrong but visible, rather than zero.
 */
export const convertAmount = (
  amount: number,
  from: SizeUnit,
  to: SizeUnit,
  reference: number | null,
): number => {
  if (from === to || reference === null || reference <= 0) return amount;
  return to === "%" ? round((amount / reference) * 100, 1) : Math.round((amount / 100) * reference);
};

const paddingOn = (element: Element, axis: Axis): number => {
  if (element.type !== "frame" || element.padding === undefined) return 0;
  if (typeof element.padding === "number") return element.padding * 2;
  return axis === "width"
    ? (element.padding.left ?? 0) + (element.padding.right ?? 0)
    : (element.padding.top ?? 0) + (element.padding.bottom ?? 0);
};

/**
 * #134 resolves a percentage against the parent's **content** box, so the
 * measured border box loses the parent's padding. Stroke is ignored: this is a
 * prototype, and a stroke is 1–2px against a reference in the hundreds.
 */
export const contentSize = (
  parent: Element | null,
  axis: Axis,
  sizes: CanvasInspectorElementSizes,
): number | null => {
  if (!parent) return null;
  const measured = sizes.get(parent.id);
  if (!measured) return null;
  return Math.max(0, Math.round(measured[axis] - paddingOn(parent, axis)));
};

export const measuredSize = (
  elementId: string,
  axis: Axis,
  sizes: CanvasInspectorElementSizes,
): number | null => {
  const measured = sizes.get(elementId);
  return measured ? Math.round(measured[axis]) : null;
};

export const hugsAxis = (element: Element, axis: Axis): boolean =>
  (element.sizing?.[axis]?.mode ?? "hug") === "hug";

export const elementLabel = (element: Element): string =>
  element.name?.trim() || `${element.type[0]?.toUpperCase()}${element.type.slice(1)}`;

export type PercentAvailability = { readonly allowed: boolean; readonly reason: string | null };

/**
 * #134's relative-sizing invariant: on an axis where the parent hugs, a
 * percentage is unavailable — not silently resolved. #37's precedent says the
 * affordance is disabled **with a reason**, not hidden, so the reason is part
 * of the answer rather than an afterthought.
 */
export const percentAvailability = (
  parents: readonly (Element | null)[],
  axis: Axis,
  rootId: string | null,
): PercentAvailability => {
  if (parents.length === 0 || parents.some((parent) => parent === null)) {
    return {
      allowed: false,
      reason: "An artboard's own size is set on the artboard, not as a percentage.",
    };
  }
  const hugging = parents.filter(
    (parent): parent is Element =>
      parent !== null && parent.id !== rootId && hugsAxis(parent, axis),
  );
  if (hugging.length === 0) return { allowed: true, reason: null };
  const first = hugging[0];
  const subject =
    hugging.length > 1 && first
      ? `${hugging.length} parents hug their ${axis}`
      : `${first ? elementLabel(first) : "The parent"} hugs its ${axis}`;
  return {
    allowed: false,
    reason: `${subject}, so a percentage has nothing to measure against.`,
  };
};

export type ElementSizingUpdate = {
  readonly elementId: string;
  readonly properties: Record<string, unknown>;
};

/**
 * #134 also says switching a parent to hug converts its children's percentages
 * to `fixed` at their current computed size. Emitted as ordinary Element updates
 * so they ride in the same command — one undo reverses the hug and the conversions.
 */
export const hugConversions = (
  parent: Element,
  axis: Axis,
  sizes: CanvasInspectorElementSizes,
): readonly ElementSizingUpdate[] =>
  (parent.children ?? []).flatMap((child) => {
    const size = child.sizing?.[axis];
    if (!size || unitOf(size.value) !== "%") return [];
    const measured = measuredSize(child.id, axis, sizes);
    if (measured === null) return [];
    return [
      {
        elementId: child.id,
        properties: {
          sizing: { ...child.sizing, [axis]: { ...size, mode: "fixed", value: measured } },
        },
      },
    ];
  });

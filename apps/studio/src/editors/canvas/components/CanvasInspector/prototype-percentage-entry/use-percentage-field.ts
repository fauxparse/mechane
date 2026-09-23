// PROTOTYPE (issue #712) — one Property row's percentage state, shared by every variant.
//
// Reads the real inspector context, writes through the real command stack. What
// a variant adds on top is only the gesture: typing a suffix (A), a menu entry
// (B), or a button in the row (C).
import { canvasElementParent, findCanvasElement } from "@mechane/commands";
import { useToastManager } from "@mechane/design-system";
import type { AxisSize, Element, SizeMode, SizeUnit } from "@mechane/domain";

import type {
  CanvasInspectorElementUpdate,
  CanvasInspectorElementSizes,
} from "../canvas-inspector-types";
import { useCanvasInspectorContext } from "../CanvasInspectorContext";
import { sizeConstraintKey, type SizeConstraint } from "../canvas-inspector-values";
import {
  amountOf,
  contentSize,
  convertAmount,
  hugConversions,
  measuredSize,
  percentAvailability,
  sizeValueFor,
  unitOf,
  type Axis,
  type PercentAvailability,
} from "./percentage-model";

export type PercentageSlot = { readonly axis: Axis; readonly constraint?: SizeConstraint };

export interface PercentageField {
  readonly slot: PercentageSlot;
  /** The label this row's value belongs to: `Width`, `Min height`. */
  readonly label: string;
  /** The one unit every selected Element carries, or null when they disagree or carry none. */
  readonly unit: SizeUnit | null;
  readonly unitMixed: boolean;
  readonly amount: number | null;
  /** #134's invariant, with the reason #37 says to show rather than hide. */
  readonly availability: PercentAvailability;
  /** The parent content box a percentage resolves against, when the selection agrees on one. */
  readonly reference: number | null;
  /** What the current percentage currently comes to, in px. */
  readonly resolved: number | null;
  readonly title: string | undefined;
  setUnit(next: SizeUnit, options?: { readonly convert?: boolean }): void;
  /** Claims a raw entry such as `50%` or `240px`. */
  commitRaw(rawValue: string): { readonly handled: boolean; readonly error: string | null };
  /** Converts children when this row switches its Element to hug. Returns true when handled. */
  interceptSizing(mode: SizeMode): boolean;
}

type Entry = {
  readonly element: Element;
  readonly stored: unknown;
  readonly parent: Element | null;
  readonly size: AxisSize | undefined;
};

const storedValue = (element: Element, slot: PercentageSlot): unknown =>
  slot.constraint
    ? element.sizing?.[sizeConstraintKey(slot.axis, slot.constraint)]
    : element.sizing?.[slot.axis]?.value;

const writeAmount = (
  entry: Entry,
  slot: PercentageSlot,
  amount: number,
  unit: SizeUnit,
): CanvasInspectorElementUpdate => {
  const sizing = entry.element.sizing ?? {};
  const value = sizeValueFor(amount, unit);
  return {
    elementId: entry.element.id,
    properties: {
      sizing: slot.constraint
        ? { ...sizing, [sizeConstraintKey(slot.axis, slot.constraint)]: value }
        : { ...sizing, [slot.axis]: { ...entry.size, mode: "fixed", value } },
    },
  };
};

const RAW_ENTRY = /^\s*(-?\d*\.?\d+)\s*(%|px)?\s*$/i;
const EMPTY_SIZES: CanvasInspectorElementSizes = new Map();

/**
 * The inspector's own stories render it with no `ToastProvider` above them, and
 * `useToastManager` throws there. A prototype must not break the existing
 * stories to announce something, so outside a provider it simply stays quiet.
 */
const useOptionalToastManager = (): {
  add(toast: { title: string; description?: string }): void;
} => {
  try {
    return useToastManager();
  } catch {
    return { add: () => undefined };
  }
};

export function usePercentageField(slot: PercentageSlot): PercentageField {
  const context = useCanvasInspectorContext();
  const { focused, selected } = context;
  // Absent in the inspector's own stories, which build the model by hand.
  const elementSizes = context.elementSizes ?? EMPTY_SIZES;
  const updateElements = context.updateElements ?? (() => undefined);
  const toast = useOptionalToastManager();
  const root = focused?.canvas.root ?? null;
  const entries: readonly Entry[] = selected.map((element) => {
    const parentInfo = root ? canvasElementParent(root, element.id) : null;
    return {
      element,
      stored: storedValue(element, slot),
      parent: parentInfo && root ? findCanvasElement(root, parentInfo.parentId) : null,
      size: element.sizing?.[slot.axis],
    };
  });

  const units = [...new Set(entries.map((entry) => unitOf(entry.stored)))];
  const unitMixed = units.length > 1;
  const unit = units.length === 1 ? (units[0] ?? null) : null;
  const amounts = [...new Set(entries.map((entry) => amountOf(entry.stored)))];
  const amount = amounts.length === 1 ? (amounts[0] ?? null) : null;

  const availability = percentAvailability(
    entries.map((entry) => entry.parent),
    slot.axis,
    root?.id ?? null,
  );
  const references = entries.map((entry) => contentSize(entry.parent, slot.axis, elementSizes));
  const reference =
    references.length > 0 && references.every((value) => value === references[0])
      ? (references[0] ?? null)
      : null;
  const resolved =
    unit === "%" && amount !== null && reference !== null
      ? Math.round((amount / 100) * reference)
      : null;

  const label = slot.constraint
    ? `${slot.constraint === "min" ? "Min" : "Max"} ${slot.axis}`
    : slot.axis === "width"
      ? "Width"
      : "Height";

  const title =
    unit === "%" && amount !== null
      ? resolved !== null && reference !== null
        ? `${label} is ${amount}% of ${reference}px — ${resolved}px right now`
        : `${label} is ${amount}% of its parent`
      : undefined;

  const setUnit: PercentageField["setUnit"] = (next, options) => {
    const convert = options?.convert ?? true;
    if (next === "%" && !availability.allowed) return;
    const updates = entries.flatMap((entry) => {
      const from = unitOf(entry.stored) ?? "px";
      const current =
        amountOf(entry.stored) ?? measuredSize(entry.element.id, slot.axis, elementSizes);
      if (current === null) return [];
      const nextAmount = convert
        ? convertAmount(current, from, next, contentSize(entry.parent, slot.axis, elementSizes))
        : current;
      return [writeAmount(entry, slot, nextAmount, next)];
    });
    updateElements(updates);
  };

  const commitRaw: PercentageField["commitRaw"] = (rawValue) => {
    const match = RAW_ENTRY.exec(rawValue);
    if (!match?.[1]) return { handled: false, error: null };
    const typed = Number(match[1]);
    if (!Number.isFinite(typed)) return { handled: false, error: null };
    // A bare number means pixels, even on a Property currently holding a percentage. The field
    // displays the unit as part of the value (`50%`), so replacing the whole entry with `25`
    // is dropping the `%` deliberately; carrying the old unit over would ignore what was typed.
    const nextUnit: SizeUnit = match[2]?.toLowerCase() === "%" ? "%" : "px";
    if (nextUnit === "%" && !availability.allowed) {
      return { handled: true, error: availability.reason };
    }
    updateElements(entries.map((entry) => writeAmount(entry, slot, Math.max(0, typed), nextUnit)));
    return { handled: true, error: null };
  };

  const interceptSizing: PercentageField["interceptSizing"] = (mode) => {
    if (slot.constraint || mode !== "hug") return false;
    const conversions = entries.flatMap((entry) =>
      hugConversions(entry.element, slot.axis, elementSizes),
    );
    if (conversions.length === 0) return false;
    updateElements([
      ...entries.map((entry) => ({
        elementId: entry.element.id,
        properties: {
          sizing: { ...entry.element.sizing, [slot.axis]: { ...entry.size, mode: "hug" } },
        },
      })),
      ...conversions,
    ]);
    toast.add({
      title: `${conversions.length} percentage ${slot.axis}${conversions.length > 1 ? "s" : ""} became fixed`,
      description: `A hugging parent has no size to be a percentage of, so the children kept their current px size. Undo reverses both.`,
    });
    return true;
  };

  return {
    slot,
    label,
    unit,
    unitMixed,
    amount,
    availability,
    reference,
    resolved,
    title,
    setUnit,
    commitRaw,
    interceptSizing,
  };
}

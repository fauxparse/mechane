// PROTOTYPE (issue #712) — which percentage-entry variant the Canvas inspector is showing.
//
// The variant lives in `?variant=`, read straight off `window.location`. Switching
// reloads, because every variant is meant to start from the same at-rest state.
export const PROTOTYPE_VARIANTS = ["A", "B", "C"] as const;

export type PrototypeVariant = (typeof PROTOTYPE_VARIANTS)[number];

export const VARIANT_NAMES: Record<PrototypeVariant, string> = {
  A: "Type the unit",
  B: "The unit is in the menu",
  C: "The unit is a button in the row",
};

export const VARIANT_HINTS: Record<PrototypeVariant, string> = {
  A: "type 50% or 240px into W/H; switching retypes, so the number you typed is the number you get",
  B: "open the W/H menu; Percent converts the value against the parent",
  C: "click the px/% button in the row; switching keeps the number",
};

export function activeVariant(): PrototypeVariant | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("variant");
  return PROTOTYPE_VARIANTS.find((variant) => variant === value) ?? null;
}

export function showVariant(variant: PrototypeVariant): void {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", variant);
  window.location.assign(url.toString());
}

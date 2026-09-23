// PROTOTYPE (issue #711) — which variant the Canvas inspector is showing.
//
// The variant lives in `?variant=`, read straight off `window.location` rather
// than through TanStack Router: `/shows/$showId/art` has no search schema and a
// throwaway prototype should not make it grow one. Switching reloads, because
// every variant is meant to start from the same at-rest state.
export const PROTOTYPE_VARIANTS = ["A", "B", "C"] as const;

export type PrototypeVariant = (typeof PROTOTYPE_VARIANTS)[number];

export const VARIANT_NAMES: Record<PrototypeVariant, string> = {
  A: "Type = like a spreadsheet",
  B: "The row never grows",
  C: "One Formula section",
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

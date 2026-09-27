// PROTOTYPE (issue #818) — which Custom Domain authoring variant Studio is showing.
//
// Three variants of Custom Domain authoring, switchable via `?variant=`, mounted
// on the Show Editor's Device inspector and on `/settings`. With no `?variant=`
// every wire point renders exactly what it renders on main.
export const PROTOTYPE_VARIANTS = ["A", "B", "C"] as const;

export type PrototypeVariant = (typeof PROTOTYPE_VARIANTS)[number];

export const VARIANT_NAMES: Record<PrototypeVariant, string> = {
  A: "Domains library in Settings",
  B: "Set up inline on the Device",
  C: "Share dialog",
};

export const VARIANT_HINTS: Record<PrototypeVariant, string> = {
  A: "manage domains at /settings; the Device inspector only picks one",
  B: "select a Device; add, prove and bind a domain without leaving the inspector",
  C: "select a Device and press Share; the domain is set up next to the QR it changes",
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

/** Keeps `?variant=` when a prototype link leaves the page. */
export function withVariant(path: string): string {
  const variant = activeVariant();
  return variant ? `${path}?variant=${variant}` : path;
}

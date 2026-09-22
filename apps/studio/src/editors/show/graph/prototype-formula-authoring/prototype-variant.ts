// PROTOTYPE (issue #675) — which variant the graph route is showing.
//
// The variant lives in `?variant=`, read straight off `window.location` rather
// than through the router: the route has no search schema, and a throwaway
// prototype should not make it grow one. Switching reloads, because a variant
// also changes the projected node width and every variant is meant to start
// from the seeded state anyway.
import { useSyncExternalStore } from "react";

import { BLANK_TRANSFORM, prototypeSnapshot, subscribePrototype } from "./formula-state";
import type { PrototypeTransform } from "./formula-state";

export const PROTOTYPE_VARIANTS = ["A", "B", "C"] as const;

export type PrototypeVariant = (typeof PROTOTYPE_VARIANTS)[number];

export const VARIANT_NAMES: Record<PrototypeVariant, string> = {
  A: "In the inspector",
  B: "The workbench",
  C: "On the node, like a sheet",
};

/** Each variant authors at its own width; 240 is the production node width. */
export const VARIANT_NODE_WIDTHS: Record<PrototypeVariant, number> = {
  A: 240,
  B: 300,
  C: 340,
};

export function activeVariant(): PrototypeVariant | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("variant");
  return PROTOTYPE_VARIANTS.find((variant) => variant === value) ?? null;
}

export function prototypeNodeWidth(): number | null {
  const variant = activeVariant();
  return variant ? VARIANT_NODE_WIDTHS[variant] : null;
}

export function showVariant(variant: PrototypeVariant): void {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", variant);
  window.location.assign(url.toString());
}

export function usePrototypeTransform(nodeId: string): PrototypeTransform {
  const snapshot = useSyncExternalStore(subscribePrototype, prototypeSnapshot);
  return snapshot[nodeId] ?? BLANK_TRANSFORM;
}

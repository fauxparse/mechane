// PROTOTYPE (issue #711) — the Properties this prototype lets you write a
// Formula on, and what to call them.
//
// The row already knows its own label and Type from the domain descriptor; this
// table exists for the surfaces that go the other way, from a stored Formula
// key back to a human name (Variant C's Formula section).
import type { Type } from "@mechane/domain";

export const FORMULA_PROPERTIES: Record<string, { label: string; type: Type }> = {
  opacity: { label: "Opacity", type: "number" },
  fill: { label: "Fill", type: "color" },
  color: { label: "Colour", type: "color" },
  fontSize: { label: "Font size", type: "number" },
  lineHeight: { label: "Line height", type: "number" },
  letterSpacing: { label: "Letter spacing", type: "number" },
  "sizing.width": { label: "Width", type: "number" },
  "sizing.height": { label: "Height", type: "number" },
};

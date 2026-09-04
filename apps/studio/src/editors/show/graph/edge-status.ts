// What an edge's status badge says, in one place (#532).
//
// Two adapters draw Show edges — the routed one and the batch-router fallback
// — and a badge that means one thing on one of them and another thing on the
// other is worse than no badge at all.

import type { ShowEdgeData } from "./graph-to-flow";

export interface EdgeStatus {
  /** The glyph, or undefined when the edge has nothing to report. */
  glyph: string | undefined;
  /** What the glyph means, for the badge's tooltip. */
  title: string | undefined;
  /** A CSS color for the glyph, or undefined for the inherited one. */
  color: string | undefined;
}

const FIRST_ITEM_GLYPH = "\u2460";

/**
 * A first-item conversion outranks a coercion glyph: "which item?" is a
 * bigger surprise than "converted on the way", and the conversion's own
 * element-to-target coercion is described in the tooltip either way.
 */
export function edgeStatus(data: ShowEdgeData | undefined): EdgeStatus {
  if (data?.invalidReason) {
    return { glyph: "!", title: data.invalidReason, color: "var(--destructive)" };
  }
  if (data?.conversion === "firstItem") {
    return {
      glyph: FIRST_ITEM_GLYPH,
      title:
        data.warningReason ??
        "Takes the first item of the list. Reordering the list changes which item this carries.",
      color: data.warningReason ? "var(--destructive)" : undefined,
    };
  }
  if (data?.warningReason) {
    return { glyph: "!", title: data.warningReason, color: "var(--destructive)" };
  }
  if (data?.coercing) {
    return { glyph: "\u219D", title: "Converted to the target's type.", color: undefined };
  }
  return { glyph: undefined, title: undefined, color: undefined };
}

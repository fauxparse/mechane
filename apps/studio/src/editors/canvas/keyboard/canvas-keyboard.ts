import type { LayoutDirection, LayoutAlignment } from "@mechane/domain";

export type CanvasKeyboardIntent =
  | { type: "nudge"; dx: number; dy: number }
  | { type: "primary-reorder"; delta: -1 | 1 | "start" | "end" }
  | { type: "cross-align"; value: LayoutAlignment };

const ALIGNMENTS: LayoutAlignment[] = ["start", "center", "end"];

export function canvasKeyboardIntent(
  direction: LayoutDirection,
  key: string,
  shiftKey: boolean,
  autoLayout: boolean,
  currentAlignment: LayoutAlignment = "start",
): CanvasKeyboardIntent | null {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) return null;
  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  const positive = key === "ArrowRight" || key === "ArrowDown";
  if (!autoLayout) {
    const amount = shiftKey ? 10 : 1;
    return {
      type: "nudge",
      dx: horizontal ? (positive ? amount : -amount) : 0,
      dy: horizontal ? 0 : positive ? amount : -amount,
    };
  }
  const primary =
    (direction === "horizontal" && horizontal) || (direction === "vertical" && !horizontal);
  if (primary) {
    if (shiftKey) return { type: "primary-reorder", delta: positive ? "end" : "start" };
    return { type: "primary-reorder", delta: positive ? 1 : -1 };
  }
  if (shiftKey) return { type: "cross-align", value: positive ? "end" : "start" };
  const current = Math.max(0, ALIGNMENTS.indexOf(currentAlignment));
  const next = positive
    ? (current + 1) % ALIGNMENTS.length
    : (current - 1 + ALIGNMENTS.length) % ALIGNMENTS.length;
  return { type: "cross-align", value: ALIGNMENTS[next]! };
}

export function nudgeAnchor(
  anchor:
    | { horizontal?: string; vertical?: string; offsetX?: number; offsetY?: number }
    | undefined,
  dx: number,
  dy: number,
) {
  const horizontal = anchor?.horizontal ?? "left";
  const vertical = anchor?.vertical ?? "top";
  return {
    horizontal,
    vertical,
    offsetX: (anchor?.offsetX ?? 0) + (horizontal === "right" ? -dx : dx),
    offsetY: (anchor?.offsetY ?? 0) + (vertical === "bottom" ? -dy : dy),
  };
}

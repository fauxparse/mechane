export const DEFAULT_CANVAS_FILL = "#FFFFFF";

/** Properties every newly created Canvas root starts with. */
export function newCanvasRootProperties(fill = DEFAULT_CANVAS_FILL): Record<string, unknown> {
  return { clip: true, fill };
}

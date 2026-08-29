import { isPropertyConnection } from "@mechane/domain";
import type { Position } from "@mechane/domain";
import type { CanvasArtboardDocument } from "../../../api/canvas";

const SCENE_PREVIEW_SIZE = { width: 720, height: 420 };
const DEFAULT_BLOCK_SIZE = { width: 720, height: 420 };
function authoredPixels(
  size: { mode: string; value?: unknown } | undefined,
  modes: readonly string[] = ["fixed"],
): number | undefined {
  if (!size || !modes.includes(size.mode) || size.value === undefined) return undefined;
  if (isPropertyConnection(size.value)) return undefined;
  if (typeof size.value === "number") return size.value;
  if (
    typeof size.value === "object" &&
    size.value !== null &&
    "value" in size.value &&
    "unit" in size.value &&
    typeof size.value.value === "number" &&
    size.value.unit === "px"
  ) {
    return size.value.value;
  }
  return undefined;
}

export interface MeasuredCanvasRoot {
  readonly width: number;
  readonly height: number;
}

export function canvasArtboardSize(
  artboard: CanvasArtboardDocument,
  measuredRoot?: MeasuredCanvasRoot,
): {
  width: number;
  height: number;
} {
  const root = artboard.canvas.root;
  const fallback = artboard.kind === "scene" ? SCENE_PREVIEW_SIZE : DEFAULT_BLOCK_SIZE;
  const designWidth = authoredPixels(root.sizing?.width, ["fixed", "fill"]);
  const designHeight = authoredPixels(root.sizing?.height, ["fixed", "fill"]);
  return {
    width:
      root.sizing?.width?.mode === "hug"
        ? (measuredRoot?.width ?? fallback.width)
        : (designWidth ?? fallback.width),
    height:
      root.sizing?.height?.mode === "hug"
        ? (measuredRoot?.height ?? fallback.height)
        : (designHeight ?? fallback.height),
  };
}

/** The gap left between a newly placed Artboard and the ones already in the workspace. */
const NEW_ARTBOARD_GAP = 80;

/**
 * Somewhere clear for an Artboard that has just been created (#426).
 *
 * To the right of everything, level with the topmost Artboard: the workspace grows sideways, so
 * that is the nearest genuinely free space, and it is where the user is already looking after
 * the editor frames it.
 */
export function freeArtboardPosition(
  artboards: readonly CanvasArtboardDocument[],
  gap = NEW_ARTBOARD_GAP,
): Position {
  if (artboards.length === 0) return { x: 0, y: 0 };
  const right = Math.max(
    ...artboards.map((artboard) => artboard.position.x + canvasArtboardSize(artboard).width),
  );
  const top = Math.min(...artboards.map((artboard) => artboard.position.y));
  return { x: right + gap, y: top };
}

/** A name no existing Block has, since `graph.addBlock` refuses a duplicate. */
export function uniqueBlockName(existing: readonly string[], preferred: string): string {
  const taken = new Set(existing.map((name) => name.trim().toLocaleLowerCase()));
  const base = preferred.trim() || "Block";
  if (!taken.has(base.toLocaleLowerCase())) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

export function artboardLabel(artboard: CanvasArtboardDocument): string {
  return (
    artboard.name.trim() || `${artboard.kind === "scene" ? "Scene" : "Block"} ${artboard.artId}`
  );
}

export function artIdFromPath(pathname: string, showId: string): string | null {
  const prefix = `/shows/${showId}/art/`;
  if (!pathname.startsWith(prefix)) return null;
  const value = pathname.slice(prefix.length).split("/")[0];
  return value ? decodeURIComponent(value) : null;
}

/**
 * Whether a pathname is the Canvas editor's.
 *
 * The Canvas route keeps the URL naming an Artboard, redirecting the bare
 * `/art` path to `/art/<artId>`. That redirect has to know whether the Canvas
 * editor is still the route in question, because a route stays mounted for a
 * moment while the router transitions away from it: without this check, the
 * first render at the *new* pathname finds no Artboard id, reads that as "bare
 * /art", and redirects straight back — silently cancelling any navigation out
 * of the Canvas editor.
 */
export function isCanvasPath(pathname: string, showId: string): boolean {
  const base = `/shows/${showId}/art`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function resolveFocusedArtboard(
  artboards: readonly CanvasArtboardDocument[],
  requestedArtId: string | null,
): CanvasArtboardDocument | null {
  return (
    artboards.find(
      (artboard) => artboard.artId === requestedArtId || artboard.canvasId === requestedArtId,
    ) ??
    artboards[0] ??
    null
  );
}

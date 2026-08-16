import { isPropertyConnection } from "@mechane/domain";
import type { CanvasArtboardDocument } from "../../../api/canvas";

const SCENE_PREVIEW_SIZE = { width: 720, height: 420 };
const DEFAULT_BLOCK_SIZE = { width: 720, height: 420 };
function authoredPixels(size: { mode: string; value?: unknown } | undefined): number | undefined {
  if (!size || size.mode !== "fixed" || size.value === undefined) return undefined;
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

export function canvasArtboardSize(artboard: CanvasArtboardDocument): {
  width: number;
  height: number;
} {
  const root = artboard.canvas.root;
  const fallback = artboard.kind === "scene" ? SCENE_PREVIEW_SIZE : DEFAULT_BLOCK_SIZE;
  return {
    width: authoredPixels(root.sizing?.width) ?? fallback.width,
    height: authoredPixels(root.sizing?.height) ?? fallback.height,
  };
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

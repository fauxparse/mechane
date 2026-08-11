import type { CanvasArtboardDocument } from "../../../api/canvas";

const SCENE_PREVIEW_SIZE = { width: 720, height: 420 };
const DEFAULT_BLOCK_SIZE = { width: 720, height: 420 };

type AuthoredSize = {
  mode: string;
  value?: number | { value: number; unit: string };
};

function authoredPixels(size: AuthoredSize | undefined): number | undefined {
  if (!size || size.mode !== "fixed" || size.value === undefined) return undefined;
  if (typeof size.value === "number") return size.value;
  return size.value.unit === "px" ? size.value.value : undefined;
}

export function canvasArtboardSize(artboard: CanvasArtboardDocument): {
  width: number;
  height: number;
} {
  if (artboard.kind === "scene") return SCENE_PREVIEW_SIZE;
  const root = artboard.canvas.root;
  return {
    width:
      authoredPixels(root.layout?.width ?? root.sizing?.width ?? root.width) ??
      DEFAULT_BLOCK_SIZE.width,
    height:
      authoredPixels(root.layout?.height ?? root.sizing?.height ?? root.height) ??
      DEFAULT_BLOCK_SIZE.height,
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

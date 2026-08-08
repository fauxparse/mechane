import type { CanvasArtboardDocument } from "../../api/canvas";

export function artIdFromPath(pathname: string, showId: string): string | null {
  const prefix = `/shows/${showId}/art/`;
  if (!pathname.startsWith(prefix)) return null;
  const value = pathname.slice(prefix.length).split("/")[0];
  return value ? decodeURIComponent(value) : null;
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

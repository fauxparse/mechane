import type { AxisSize, ElementSizing, SizeValue } from "@mechane/domain/canvas";
import type { Position } from "@mechane/domain/graph";
import { isPropertyConnection } from "@mechane/domain/property-values";
import type { CanvasArtboardDocument } from "../../../api/canvas";

const SCENE_PREVIEW_SIZE = { width: 720, height: 420 };
const DEFAULT_BLOCK_SIZE = { width: 720, height: 420 };
/** Only literal pixel sizes provide a finite editor preview dimension. */
function authoredPixels(value: AxisSize["value"] | SizeValue | undefined): number | undefined {
  if (isPropertyConnection(value)) return undefined;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    "unit" in value &&
    typeof value.value === "number" &&
    value.unit === "px"
  ) {
    return value.value;
  }
  return undefined;
}

/**
 * The literal pixel size a root authors on one axis. A filled Scene root has no size of its
 * own — it takes the Player's viewport — so it is designed at its minimum.
 */
export function authoredRootPixels(
  sizing: ElementSizing | undefined,
  axis: "width" | "height",
  kind: CanvasArtboardDocument["kind"],
): number | undefined {
  const size = sizing?.[axis];
  if (kind === "scene" && size?.mode === "fill")
    return authoredPixels(sizing?.[axis === "width" ? "minWidth" : "minHeight"]);
  return size?.mode === "fixed" ? authoredPixels(size.value) : undefined;
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
  const designWidth = authoredRootPixels(root.sizing, "width", artboard.kind);
  const designHeight = authoredRootPixels(root.sizing, "height", artboard.kind);
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
const DEFAULT_ARTBOARD_SIZE = { width: 720, height: 420 };

function overlaps(
  position: Position,
  size: { width: number; height: number },
  obstacle: CanvasArtboardDocument,
  gap: number,
): boolean {
  const obstacleSize = canvasArtboardSize(obstacle);
  return (
    position.x < obstacle.position.x + obstacleSize.width + gap &&
    position.x + size.width + gap > obstacle.position.x &&
    position.y < obstacle.position.y + obstacleSize.height + gap &&
    position.y + size.height + gap > obstacle.position.y
  );
}

/**
 * Somewhere clear below the Artboard the new Block came from (#441).
 *
 * Moving only downward preserves the source Artboard's column while checking every existing
 * Artboard, including ones added by an earlier creation in the same workspace session.
 */
export function freeArtboardPosition(
  artboards: readonly CanvasArtboardDocument[],
  source: CanvasArtboardDocument,
  size: { width: number; height: number } = DEFAULT_ARTBOARD_SIZE,
  gap = NEW_ARTBOARD_GAP,
): Position {
  let position = {
    x: source.position.x,
    y: source.position.y + canvasArtboardSize(source).height + gap,
  };
  while (true) {
    const obstacle = artboards.find((artboard) => overlaps(position, size, artboard, gap));
    if (!obstacle) return position;
    const nextY = obstacle.position.y + canvasArtboardSize(obstacle).height + gap;
    position = { x: position.x, y: Math.max(position.y, nextY) };
  }
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

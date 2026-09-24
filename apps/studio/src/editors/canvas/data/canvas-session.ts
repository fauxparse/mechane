import { findCanvasElement } from "@mechane/commands";

import type { CanvasArtboardDocument } from "../../../api/canvas";
import type { CanvasCamera } from "../components/canvas-camera";
import type { CanvasSelection } from "../components/canvas-selection";

/**
 * Canvas viewport and selection for the current tab. A page reload — a dev-server reconnect, a
 * discarded background tab, a deploy — must not scroll the Canvas away or drop the selection, so
 * both are written through to `sessionStorage`, which is per tab and survives reloads. The map
 * keeps reads synchronous and covers environments without storage.
 */
const memory = new Map<string, unknown>();

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    // Storage can be blocked outright; the in-memory copy still serves this page.
    return null;
  }
}

function read(key: string): unknown {
  if (memory.has(key)) return memory.get(key);
  const raw = storage()?.getItem(key);
  if (raw === null || raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    memory.set(key, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  memory.set(key, value);
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked store only costs persistence across reloads.
  }
}

const cameraKey = (showId: string) => `mechane:canvas-camera:${showId}`;
const selectionKey = (showId: string) => `mechane:canvas-selection:${showId}`;

export function rememberedCanvasCamera(showId: string): CanvasCamera | undefined {
  const stored = read(cameraKey(showId));
  if (
    typeof stored !== "object" ||
    stored === null ||
    !("x" in stored) ||
    !("y" in stored) ||
    !("zoom" in stored)
  )
    return undefined;
  const { x, y, zoom } = stored;
  return typeof x === "number" &&
    typeof y === "number" &&
    typeof zoom === "number" &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(zoom) &&
    zoom > 0
    ? { x, y, zoom }
    : undefined;
}

export function rememberCanvasCamera(showId: string, camera: CanvasCamera): void {
  write(cameraKey(showId), { x: camera.x, y: camera.y, zoom: camera.zoom });
}

export function rememberedCanvasSelection(showId: string): CanvasSelection | undefined {
  const stored = read(selectionKey(showId));
  if (typeof stored !== "object" || stored === null) return undefined;
  if (!("artId" in stored) || !("elementIds" in stored)) return undefined;
  const { artId, elementIds } = stored;
  if (artId !== null && typeof artId !== "string") return undefined;
  if (!Array.isArray(elementIds)) return undefined;
  return {
    artId,
    elementIds: elementIds.filter((id): id is string => typeof id === "string"),
  };
}

export function rememberCanvasSelection(showId: string, selection: CanvasSelection): void {
  write(selectionKey(showId), { artId: selection.artId, elementIds: [...selection.elementIds] });
}

/**
 * A remembered selection against the documents as they are now: an Artboard that is gone drops
 * the selection, and Elements deleted since it was stored drop out of it.
 */
export function restoreCanvasSelection(
  selection: CanvasSelection | undefined,
  artboards: readonly CanvasArtboardDocument[],
): CanvasSelection {
  const artboard = artboards.find((candidate) => candidate.artId === selection?.artId);
  if (!selection || !artboard) return { artId: null, elementIds: [] };
  return {
    artId: artboard.artId,
    elementIds: selection.elementIds.filter((id) => findCanvasElement(artboard.canvas.root, id)),
  };
}

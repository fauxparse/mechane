import type { CanvasCamera } from "../graph/canvas-camera";

const cameraByShow = new Map<string, CanvasCamera>();

/** Keeps Canvas viewport state for the current browser session without persisting it. */
export function rememberedCanvasCamera(showId: string): CanvasCamera | undefined {
  return cameraByShow.get(showId);
}

export function rememberCanvasCamera(showId: string, camera: CanvasCamera): void {
  cameraByShow.set(showId, { ...camera });
}

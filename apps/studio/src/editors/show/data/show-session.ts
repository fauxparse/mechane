import type { Viewport } from "@xyflow/react";

const viewportByShow = new Map<string, Viewport>();

/** Keeps Show Editor viewport state for the current browser session. */
export function rememberedShowViewport(showId: string): Viewport | undefined {
  return viewportByShow.get(showId);
}

export function rememberShowViewport(showId: string, viewport: Viewport): void {
  viewportByShow.set(showId, { ...viewport });
}

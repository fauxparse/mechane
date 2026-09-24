import type { ShowGraphViewport } from "../graph/react-flow";

const viewportByShow = new Map<string, ShowGraphViewport>();

/** Keeps Show Editor viewport state for the current browser session. */
export function rememberedShowViewport(showId: string): ShowGraphViewport | undefined {
  return viewportByShow.get(showId);
}

export function rememberShowViewport(showId: string, viewport: ShowGraphViewport): void {
  viewportByShow.set(showId, { ...viewport });
}

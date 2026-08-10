/** Converts a screen-space distance into the nearest canvas (logical) pixel. */
export function roundToLogicalPixel(value: number, zoom: number): number {
  return Math.round(value / zoom);
}

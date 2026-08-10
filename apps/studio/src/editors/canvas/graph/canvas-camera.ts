export interface CanvasCamera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_CANVAS_ZOOM = 0.15;
export const MAX_CANVAS_ZOOM = 4;

export function clampCanvasZoom(zoom: number): number {
  return Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, zoom));
}

export function panCanvasCamera(camera: CanvasCamera, dx: number, dy: number): CanvasCamera {
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

/** Zooms around a viewport point, keeping its world coordinate fixed. */
export function zoomCanvasCamera(
  camera: CanvasCamera,
  point: { x: number; y: number },
  requestedZoom: number,
): CanvasCamera {
  const zoom = clampCanvasZoom(requestedZoom);
  const worldX = (point.x - camera.x) / camera.zoom;
  const worldY = (point.y - camera.y) / camera.zoom;
  return {
    x: point.x - worldX * zoom,
    y: point.y - worldY * zoom,
    zoom,
  };
}

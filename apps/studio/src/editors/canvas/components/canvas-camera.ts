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

export interface CanvasCameraRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasCameraViewport {
  width: number;
  height: number;
  inset?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

/** Frames a world-space rectangle in the viewport's usable area with breathing room. */
export function fitCanvasCamera(
  target: CanvasCameraRect,
  viewport: CanvasCameraViewport,
): CanvasCamera {
  const inset = viewport.inset ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const editableWidth = Math.max(0, viewport.width - inset.left - inset.right);
  const editableHeight = Math.max(0, viewport.height - inset.top - inset.bottom);
  const roomX = (editableWidth - editableWidth / 1.2) / 2;
  const roomY = (editableHeight - editableHeight / 1.2) / 2;
  const availableWidth = Math.max(1, editableWidth - roomX * 2);
  const availableHeight = Math.max(1, editableHeight - roomY * 2);
  const width = Math.max(1, target.width);
  const height = Math.max(1, target.height);
  const zoom = clampCanvasZoom(Math.min(availableWidth / width, availableHeight / height));
  const centerX = inset.left + editableWidth / 2;
  const centerY = inset.top + editableHeight / 2;

  return {
    x: centerX - (target.x + width / 2) * zoom,
    y: centerY - (target.y + height / 2) * zoom,
    zoom,
  };
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

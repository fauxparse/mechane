import { describe, expect, it } from "vitest";

import { panCanvasCamera, zoomCanvasCamera } from "./canvas-camera";

describe("Canvas camera math", () => {
  it("pans without imposing document bounds", () => {
    expect(panCanvasCamera({ x: 0, y: 0, zoom: 1 }, -640, 320)).toEqual({
      x: -640,
      y: 320,
      zoom: 1,
    });
  });

  it("keeps the world point beneath the pointer fixed while zooming", () => {
    const camera = { x: 40, y: -20, zoom: 2 };
    const point = { x: 300, y: 180 };
    const next = zoomCanvasCamera(camera, point, 3);
    const worldBefore = { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
    const worldAfter = { x: (point.x - next.x) / next.zoom, y: (point.y - next.y) / next.zoom };
    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
  });

  it("clamps keyboard and wheel zoom to the camera range", () => {
    expect(zoomCanvasCamera({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 0).zoom).toBe(0.15);
    expect(zoomCanvasCamera({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 8).zoom).toBe(4);
  });
});

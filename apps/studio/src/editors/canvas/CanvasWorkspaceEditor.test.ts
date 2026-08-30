import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type * as CanvasGeometry from "./components/canvas-geometry";
import type { CanvasWorkspaceSurfaceProps } from "./canvas-workspace-types";

const mocks = vi.hoisted(() => ({
  surfaceProps: null as CanvasWorkspaceSurfaceProps | null,
}));

vi.mock("@mechane/design-system", () => ({
  useToastManager: () => ({ add: vi.fn() }),
}));

vi.mock("./components/CanvasWorkspaceSurface", () => ({
  CanvasWorkspaceSurface: (props: CanvasWorkspaceSurfaceProps) => {
    mocks.surfaceProps = props;
    return null;
  },
}));

vi.mock("./components/CanvasWorkspaceEditorCommands", () => ({
  CanvasWorkspaceEditorCommands: () => null,
}));

vi.mock("./components/use-canvas-camera", () => ({
  useCanvasCamera: () => ({
    camera: { x: 0, y: 0, zoom: 1 },
    workspaceRef: { current: null },
    beginCameraDrag: vi.fn(),
    moveCameraDrag: vi.fn(),
    endCameraDrag: vi.fn(),
    frameRect: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetCamera: vi.fn(),
  }),
}));

vi.mock("./components/canvas-geometry", async () => {
  const actual = await vi.importActual<typeof CanvasGeometry>("./components/canvas-geometry");
  return {
    ...actual,
    useCanvasGeometry: () => ({ geometry: new Map(), measuredZoom: 1 }),
  };
});

import { CanvasWorkspaceEditor } from "./CanvasWorkspaceEditor";

describe("CanvasWorkspaceEditor", () => {
  it("routes bulk Inspector updates to the drawing surface", () => {
    const onUpdateElements = vi.fn();

    renderToStaticMarkup(
      createElement(CanvasWorkspaceEditor, {
        artboards: [],
        focusedArtId: null,
        onFocusArtboard: vi.fn(),
        onBeginMoveArtboard: vi.fn(),
        onMoveArtboard: vi.fn(),
        onEndMoveArtboard: vi.fn(),
        onUpdateElements,
      }),
    );

    expect(mocks.surfaceProps?.onUpdateElements).toBe(onUpdateElements);
    mocks.surfaceProps?.onUpdateElements?.("canvas-1", [
      { elementId: "element-1", properties: { width: 240 } },
    ]);
    expect(onUpdateElements).toHaveBeenCalledWith("canvas-1", [
      { elementId: "element-1", properties: { width: 240 } },
    ]);
    expect(onUpdateElements).toHaveBeenCalledTimes(1);
  });
});

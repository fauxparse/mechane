import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inspectorProps: null as { onUpdateElements?: (...args: unknown[]) => void } | null,
}));

vi.mock("@mechane/design-system", () => ({
  Puzzle: () => null,
  TvMinimal: () => null,
  useToastManager: () => ({ add: vi.fn() }),
}));

vi.mock("../../components/EditorLayout/editor-slots", () => ({
  EditorSlot: ({ children }: { children: unknown }) => children,
}));

vi.mock("./components/CanvasInspector/CanvasInspector", () => ({
  CanvasInspector: (props: { onUpdateElements?: (...args: unknown[]) => void }) => {
    mocks.inspectorProps = props;
    return null;
  },
}));

vi.mock("./components/CanvasLayers", () => ({ CanvasLayers: () => null }));
vi.mock("./Toolbar/Toolbar", () => ({ Toolbar: () => null }));
vi.mock("./components/CanvasWorkspaceEditorCommands", () => ({
  CanvasWorkspaceEditorCommands: () => null,
}));
vi.mock("./google-fonts-provider", () => ({
  useGoogleFonts: () => ({ data: [] }),
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
  const actual = await vi.importActual<typeof import("./components/canvas-geometry")>(
    "./components/canvas-geometry",
  );
  return {
    ...actual,
    useCanvasGeometry: () => ({ geometry: new Map(), measuredZoom: 1, revision: 0 }),
  };
});

import { CanvasWorkspaceEditor } from "./CanvasWorkspaceEditor";

describe("CanvasWorkspaceEditor", () => {
  it("preserves the composite Inspector update callback at the editor boundary", () => {
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

    expect(mocks.inspectorProps?.onUpdateElements).toBe(onUpdateElements);
    mocks.inspectorProps?.onUpdateElements?.("canvas-1", [
      { elementId: "element-1", properties: { width: 240 } },
    ]);
    expect(onUpdateElements).toHaveBeenCalledWith("canvas-1", [
      { elementId: "element-1", properties: { width: 240 } },
    ]);
    expect(onUpdateElements).toHaveBeenCalledTimes(1);
  });
});

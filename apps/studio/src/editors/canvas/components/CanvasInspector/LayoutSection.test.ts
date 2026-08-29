import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CanvasArtboardDocument } from "../../../../api/canvas";
import type { CanvasInspectorModel } from "./canvas-inspector-types";
import { CanvasInspectorProvider } from "./CanvasInspectorContext";
import { LayoutSection } from "./LayoutSection";

const slot = {
  id: "candidate-slot",
  type: "slot" as const,
  blockId: "candidate-button",
  layoutMode: "auto" as const,
  direction: "vertical" as const,
  gap: 16,
  padding: 12,
};

const focused: CanvasArtboardDocument = {
  canvasId: "canvas-scene",
  artId: "scene-candidate-list",
  kind: "scene",
  name: "Candidate list",
  canvas: { kind: "scene", root: { id: "root", type: "frame", children: [slot] } },
  position: { x: 0, y: 0 },
};

const model: CanvasInspectorModel = {
  focused,
  target: slot,
  elements: [slot],
  selected: [slot],
  blocks: [],
  variables: [],
  shapes: [],
  imageAssets: [],
  deviceQrImages: {},
  fontFamilies: [],
  inspectorPreview: null,
  currentDimensions: null,
  absolute: false,
  common: (property) => Reflect.get(slot, property),
  update: () => {},
  text: () => "",
  isAspectRatioLocked: false,
  setAspectRatioLock: () => {},
};

describe("LayoutSection", () => {
  it("shows Frame layout controls for a selected Slot", () => {
    const html = renderToStaticMarkup(
      createElement(CanvasInspectorProvider, { value: model }, createElement(LayoutSection)),
    );

    expect(html).toContain("Clip children");
  });
});

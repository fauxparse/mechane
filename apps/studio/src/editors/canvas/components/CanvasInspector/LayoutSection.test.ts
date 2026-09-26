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

function renderLayoutSection(selected: CanvasInspectorModel["selected"]): string {
  return renderToStaticMarkup(
    createElement(
      CanvasInspectorProvider,
      { value: { ...model, elements: selected, selected } },
      createElement(LayoutSection),
    ),
  );
}

function clipSwitch(html: string): string {
  return html.match(/<[^>]*aria-label="Clip children"[^>]*>/)?.[0] ?? "";
}

describe("LayoutSection", () => {
  it("shows Frame layout controls for a selected Slot", () => {
    expect(renderLayoutSection([slot])).toContain("Clip children");
  });

  it("shows an unset clip as on, and only mixed clips as indeterminate", () => {
    const unset = clipSwitch(renderLayoutSection([slot]));
    expect(unset).toContain('aria-checked="true"');
    expect(unset).not.toContain('data-indeterminate=""');

    const mixed = clipSwitch(renderLayoutSection([slot, { ...slot, id: "other", clip: false }]));
    expect(mixed).toContain('data-indeterminate=""');
  });
});

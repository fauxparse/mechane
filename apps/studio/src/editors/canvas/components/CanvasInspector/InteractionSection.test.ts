import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CanvasArtboardDocument } from "../../../../api/canvas";

import type { CanvasInspectorModel } from "./canvas-inspector-types";
import { CanvasInspectorProvider } from "./CanvasInspectorContext";
import { InteractionSection } from "./InteractionSection";

const element = { id: "button-vote", type: "rect" as const, name: "Vote" };
const focused: CanvasArtboardDocument = {
  canvasId: "canvas-voting",
  artId: "scene-voting",
  kind: "scene",
  name: "Voting",
  canvas: { kind: "scene", root: { id: "root", type: "frame", children: [element] } },
  position: { x: 0, y: 0 },
};

const model: CanvasInspectorModel = {
  focused,
  target: element,
  elements: [element],
  selected: [element],
  blocks: [],
  variables: [],
  shapes: [],
  cues: [
    {
      id: "cue-vote",
      name: "Submit vote",
      owner: { kind: "scene", sceneId: "scene-voting" },
      actionIds: [],
    },
  ],
  actions: [],
  eventBindings: [
    {
      id: "binding-vote",
      canvasId: "canvas-voting",
      elementId: "button-vote",
      eventKind: "tap",
      cueId: "cue-vote",
    },
  ],
  imageAssets: [],
  deviceQrImages: {},
  onCreateCue: () => {},
  onCreateEventBinding: () => {},
  fontFamilies: [],
  inspectorPreview: null,
  currentDimensions: null,
  absolute: true,
  common: () => undefined,
  update: () => {},
  text: () => "",
  isAspectRatioLocked: false,
  setAspectRatioLock: () => {},
};

describe("InteractionSection", () => {
  it("renders the binding controls and add interaction affordance", () => {
    const html = renderToStaticMarkup(
      createElement(CanvasInspectorProvider, { value: model }, createElement(InteractionSection)),
    );

    expect(html).toContain('aria-label="Interaction Event"');
    expect(html).toContain('aria-label="Interaction Cue"');
    expect(html).toContain('aria-label="Duplicate Tap interaction"');
    expect(html).toContain('aria-label="Delete Tap interaction"');
    expect(html).toContain("Tap");
    expect(html).toContain("Submit vote");
    expect(html).toContain("Add interaction");
  });

  it("does not render for a multi-selection", () => {
    const html = renderToStaticMarkup(
      createElement(
        CanvasInspectorProvider,
        {
          value: { ...model, selected: [element, { ...element, id: "other" }] },
        },
        createElement(InteractionSection),
      ),
    );

    expect(html).toBe("");
  });
});

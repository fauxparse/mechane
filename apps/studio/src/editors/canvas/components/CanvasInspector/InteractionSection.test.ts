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
  it("exposes a keyboard-addressable Cue selector and owner", () => {
    const html = renderToStaticMarkup(
      createElement(CanvasInspectorProvider, { value: model }, createElement(InteractionSection)),
    );

    expect(html).toContain('aria-label="Interaction Cue"');
    expect(html).toContain("Scene owner · Voting");
    expect(html).toContain("Submit vote");
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

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CanvasArtboardDocument } from "../../../../api/canvas";

import type { CanvasInspectorModel } from "./canvas-inspector-types";
import { CanvasInspectorProvider } from "./CanvasInspectorContext";
import { InteractionSection, keypressUnavailableReason } from "./InteractionSection";

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
      position: 0,
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

    // An Event kind is fixed at creation (#517), so the kind reads as a static
    // icon and label rather than a picker; only the Cue is chosen here.
    expect(html).not.toContain('aria-label="Interaction Event"');
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

const keypressModel = (key: string | null): CanvasInspectorModel => ({
  ...model,
  target: focused.canvas.root,
  elements: [focused.canvas.root],
  selected: [focused.canvas.root],
  eventBindings: [
    {
      id: "binding-shortcut",
      canvasId: "canvas-voting",
      elementId: "root",
      eventKind: "keypress",
      cueId: "cue-vote",
      position: 0,
      params: { key },
    },
  ],
});

const renderSection = (value: CanvasInspectorModel) =>
  renderToStaticMarkup(
    createElement(CanvasInspectorProvider, { value }, createElement(InteractionSection)),
  );

describe("InteractionSection keypress bindings", () => {
  it("shows the key's display name and its spoken name", () => {
    const html = renderSection(keypressModel("ArrowLeft"));

    expect(html).toContain("←");
    expect(html).toContain('aria-label="Keypress: Left arrow"');
    expect(html).toContain('aria-keyshortcuts="ArrowLeft"');
  });

  it("reads an unset key as Not set rather than an empty control", () => {
    const html = renderSection(keypressModel(null));

    expect(html).toContain("Not set");
    expect(html).toContain('aria-label="Keypress: not set"');
    expect(html).not.toContain("aria-keyshortcuts");
  });
});

// The menu's availability rule, tested directly: DropdownMenuContent renders
// nothing while closed, so asserting on markup would pass vacuously.
describe("keypressUnavailableReason", () => {
  it("allows a Keypress on a Scene Canvas root", () => {
    expect(keypressUnavailableReason("scene", true)).toBeNull();
  });

  it("refuses a non-root Element, where a Keypress would be inert", () => {
    expect(keypressUnavailableReason("scene", false)).toBe(
      "Select the Scene background to add a Keypress",
    );
  });

  it("refuses a Block Canvas, root or not", () => {
    expect(keypressUnavailableReason("block", true)).toBe("Only Scenes can listen for keypresses");
    expect(keypressUnavailableReason("block", false)).toBe("Only Scenes can listen for keypresses");
  });
});

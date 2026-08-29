import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Block, SceneVariable, Shape } from "@mechane/domain";
import type { CanvasArtboardDocument } from "../../../../api/canvas";
import type { CanvasInspectorModel } from "./canvas-inspector-types";
import { CanvasInspectorProvider } from "./CanvasInspectorContext";
import { SlotInputsSection } from "./CanvasInspectorFields";

const candidateShape: Shape = {
  id: "shape_candidate",
  name: "Candidate",
  fields: [
    { id: "field_name", name: "name", type: "text", required: true, defaultValue: "" },
    { id: "field_votes", name: "votes", type: "number", required: true, defaultValue: 0 },
  ],
};

const sceneVariable: SceneVariable = {
  id: "variable_candidates",
  name: "Candidates",
  type: { kind: "array", of: { kind: "shape", shapeId: candidateShape.id } },
};

const block: Block = {
  id: "block_candidate_button",
  name: "CandidateButton",
  canvas: {
    id: "canvas_candidate_button",
    kind: "block",
    root: { id: "root", type: "frame", children: [] },
  },
  variables: [
    {
      id: "candidate_button_candidate",
      name: "Candidate",
      type: { kind: "shape", shapeId: candidateShape.id },
      required: true,
    },
  ],
  states: [],
};

const slot = {
  id: "candidate-slot",
  type: "slot" as const,
  blockId: block.id,
  expansion: { source: { kind: "variable" as const, variableId: sceneVariable.id } },
  assignments: [{ variableId: block.variables[0]!.id, source: { kind: "runtimeItem" as const } }],
};

const focused: CanvasArtboardDocument = {
  canvasId: "canvas-scene",
  artId: "scene-candidates",
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
  blocks: [block],
  variables: [sceneVariable],
  shapes: [candidateShape],
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

describe("SlotInputsSection", () => {
  it("shows a Scene array mapped to a Shape Block input", () => {
    const html = renderToStaticMarkup(
      createElement(CanvasInspectorProvider, { value: model }, createElement(SlotInputsSection)),
    );

    expect(html).toContain("Candidates");
    expect(html).toContain("Candidate");
  });
});

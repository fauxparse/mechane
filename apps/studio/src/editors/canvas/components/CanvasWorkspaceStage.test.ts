import { createRef, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { prepareCanvasForRender } from "@mechane/rendering";
import type { CanvasArtboardDocument } from "../../../api/canvas";
import type { Block, Canvas, SlotVariableValue } from "@mechane/domain";
import { CanvasWorkspaceStage } from "./CanvasWorkspaceStage";

const block: Block = {
  id: "block_candidate_button",
  name: "CandidateButton",
  canvas: {
    id: "canvas_candidate_button",
    kind: "block",
    root: {
      id: "candidate_button_root",
      type: "frame",
      children: [
        { id: "candidate_name", type: "text", content: { kind: "variable", variableId: "name" } },
      ],
    },
  },
  variables: [{ id: "name", name: "Name", type: "text", required: true }],
  states: [],
};

const renderVariables: readonly SlotVariableValue[] = [
  {
    id: "candidates",
    type: { kind: "array", of: "text" },
    value: ["Alice", "Beatrix", "Clarissa"],
  },
];

const canvas: Canvas = {
  kind: "scene",
  root: {
    id: "scene_root",
    type: "frame",
    children: [
      {
        id: "candidate_slot",
        type: "slot",
        blockId: block.id,
        expansion: { source: { kind: "variable", variableId: "candidates" } },
        assignments: [{ variableId: "name", source: { kind: "runtimeItem" } }],
      },
    ],
  },
};

const artboard: CanvasArtboardDocument = {
  canvasId: "canvas_scene",
  artId: "scene_candidates",
  kind: "scene",
  name: "Candidate list",
  canvas,
  renderPresentation: prepareCanvasForRender({
    canvas,
    variables: renderVariables,
    shapes: [],
    blocks: [block],
    imageAssets: [],
    mode: "studio",
  }),
  position: { x: 0, y: 0 },
};

const noop = () => {};

function stageMarkup(): string {
  return renderToStaticMarkup(
    createElement(CanvasWorkspaceStage, {
      viewport: {
        camera: { x: 0, y: 0, zoom: 1 },
        workspaceRef: createRef<HTMLElement>(),
        beginCameraDrag: noop,
        moveCameraDrag: noop,
        endCameraDrag: noop,
      },
      ordered: [artboard],
      focused: artboard,
      artboardSizes: new Map([[artboard.artId, { width: 300, height: 300 }]]),
      geometrySnapshot: { geometry: new Map(), measuredZoom: 1, revision: 0 },
      selection: { artId: null, elementIds: [] },
      tool: "select",
      renamingArtId: null,
      onRenamingArtIdChange: noop,
      onIntent: noop,
      onLiveElementGeometry: noop,
    }),
  );
}

describe("CanvasWorkspaceStage", () => {
  it("passes each Artboard's variables to repeated Slots", () => {
    const markup = stageMarkup();
    expect(markup).toContain("Alice");
    expect(markup).toContain("Beatrix");
    expect(markup).toContain("Clarissa");
    expect(markup).toMatch(/data-element-id="candidate_slot"[^>]*display:flex/);
  });

  it("isolates Artboards and renders camera transforms", () => {
    const markup = stageMarkup();
    expect(markup).not.toContain("will-change:transform");
    expect(markup).toContain("contain:layout paint");
  });
});

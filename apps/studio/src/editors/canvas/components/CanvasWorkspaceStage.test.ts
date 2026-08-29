import { createRef, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
  renderVariables,
  position: { x: 0, y: 0 },
};

const noop = () => {};
const noElementDrag = () => false;

function stageMarkup(): string {
  return renderToStaticMarkup(
    createElement(CanvasWorkspaceStage, {
      workspaceRef: createRef<HTMLElement>(),
      onCancelCreation: noop,
      onHandleCanvasKeyDown: noop,
      onBeginWorkspaceInteraction: noop,
      onMoveWorkspaceInteraction: noop,
      onEndWorkspaceInteraction: noop,
      onCancelWorkspaceInteraction: noop,
      tool: "select",
      setTool: noop,
      camera: { x: 0, y: 0, zoom: 1 },
      ordered: [artboard],
      artboardSizes: new Map([[artboard.artId, { width: 300, height: 300 }]]),
      blocks: [block],
      shapes: [],
      drag: null,
      focused: artboard,
      onBeginCreation: noop,
      onFocusArtboard: noop,
      onSelect: noop,
      onBeginRubberband: noop,
      onBeginElementDrag: noElementDrag,
      onSelectAtPoint: noop,
      onUpdateElementDrag: noop,
      onUpdateRubberband: noop,
      onBeginDrag: noop,
      onUpdateElement: noop,
      onMoveDrag: noop,
      onMoveCreation: noop,
      onFinishElementDrag: noop,
      onEndRubberband: noop,
      onEndDrag: noop,
      onFinishCreation: noop,
      renamingArtId: null,
      setRenamingArtId: noop,
      onRenameArtboard: noop,
      overlayRect: null,
      resizePreview: null,
      resizeCursor: null,
      resizable: false,
      onBeginResize: noop,
      creationOverlayRect: null,
      dragLine: null,
      rubberbandRect: null,
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

import { resolveSlotInstances } from "@mechane/domain";
import type { Block, BlockVariable, ShowGraph } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import type { CanvasArtboardDocument } from "../../../api/canvas";
import { blocksForArtboards } from "./use-canvas-artboards";

const variable = {
  id: "title",
  name: "Title",
  type: "text",
  required: true,
} satisfies BlockVariable;

const block = {
  id: "block-card",
  name: "Card",
  canvas: {
    id: "canvas-card",
    kind: "block",
    root: { id: "card-root", type: "frame", children: [] },
  },
  variables: [variable],
  states: [],
  stateSelectorVariableId: null,
} satisfies Block;

const artboard = {
  canvasId: "canvas-card",
  artId: "block-card",
  kind: "block",
  name: "Card",
  canvas: {
    kind: "block",
    root: { id: "card-root", type: "frame", children: [] },
  },
  position: { x: 0, y: 0 },
} satisfies CanvasArtboardDocument;

const graph = {
  nodes: [],
  edges: [],
  blocks: [block],
} satisfies ShowGraph;

describe("Canvas artboard Block summaries", () => {
  it("preserves Block variables and metadata for inspector and Slot rendering", () => {
    const [summary] = blocksForArtboards([artboard], graph);

    expect(summary).toMatchObject({
      id: block.id,
      name: block.name,
      variables: [variable],
      states: block.states,
      stateSelectorVariableId: block.stateSelectorVariableId,
    });
    expect(summary?.canvas).toEqual({ ...artboard.canvas, id: artboard.canvasId });
  });

  it("supplies Block metadata required to resolve a Slot instance", () => {
    const [summary] = blocksForArtboards([artboard], graph);
    expect(summary).toBeDefined();
    if (!summary) return;
    const resolution = resolveSlotInstances(summary, {
      id: "slot",
      type: "slot",
      blockId: block.id,
      assignments: [{ variableId: variable.id, source: { kind: "literal", value: "Hello" } }],
    });

    expect(resolution.diagnostic).toBeUndefined();
    expect(resolution.instances[0]?.canvas).toBeDefined();
    expect(resolution.instances[0]?.variables).toEqual([
      { id: variable.id, type: variable.type, value: "Hello" },
    ]);
  });
});

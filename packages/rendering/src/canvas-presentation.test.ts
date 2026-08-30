import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Block, ShowGraph } from "@mechane/domain";
import { CanvasRenderer } from "./canvas-renderer";
import { prepareCanvasPresentation } from "./canvas-presentation";

const block: Block = {
  name: "Card",
  id: "card",
  canvas: {
    id: "card-canvas",
    kind: "block",
    root: {
      id: "card-root",
      type: "frame",
      children: [{ id: "title", type: "text", content: { kind: "variable", variableId: "title" } }],
    },
  },
  variables: [{ id: "title", name: "Title", type: "text", required: true }],
  states: [],
};

const graph = {
  nodes: [
    {
      id: "source",
      kind: "source",
      name: "Title Source",
      parentId: null,
      position: { x: 0, y: 0 },
      type: "text",
    },
    {
      id: "scene",
      kind: "scene",
      name: "Scene",
      parentId: null,
      position: { x: 0, y: 0 },
      variables: [{ id: "title", name: "Title", type: "text", defaultValue: "Fallback" }],
    },
  ],
  edges: [
    {
      id: "edge",
      kind: "wiring",
      sourceId: "source",
      targetId: "scene",
      sourcePath: [],
      targetPath: ["title"],
    },
  ],
  shapes: [],
  sourceFieldDefaults: [{ nodeId: "source", fieldPath: [], value: "Prepared" }],
  blocks: [block],
} satisfies ShowGraph;

const canvas = {
  kind: "scene" as const,
  root: {
    id: "scene-root",
    type: "frame" as const,
    children: [
      {
        id: "slot",
        type: "slot" as const,
        blockId: block.id,
        assignments: [
          { variableId: "title", source: { kind: "variable" as const, variableId: "title" } },
        ],
      },
    ],
  },
};

describe("Canvas presentation", () => {
  it("resolves Scene Properties and nested Slots before CanvasRenderer", () => {
    const scene = graph.nodes.find((node) => node.id === "scene");
    if (scene?.kind !== "scene") throw new Error("Scene is missing.");
    const presentation = prepareCanvasPresentation({
      canvas,
      graph,
      blocks: [block],
      imageAssets: [],
      owner: {
        kind: "scene",
        scene,
        sourceValues: { source: "Prepared" },
      },
      mode: "player",
    });
    const html = renderToStaticMarkup(createElement(CanvasRenderer, { presentation }));

    expect(html).toContain("Prepared");
    expect(presentation.root.children[0]?.slot?.instances[0]?.element).toBeDefined();
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { generateId } from "@mechane/domain";
import type { Block, ShowGraph, StructuredValues } from "@mechane/domain";
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

describe("Element Formulas inside a repeated Slot", () => {
  const candidate = { kind: "shape", shapeId: "shape_candidate" } as const;
  const candidates = { kind: "array", of: candidate } as const;
  const arrayId = generateId("structuredValue");
  const itemIds = [generateId("structuredValue"), generateId("structuredValue")];
  const structuredValues: StructuredValues = {
    [itemIds[0]!]: {
      id: itemIds[0]!,
      kind: "shape",
      type: candidate,
      fields: { field_name: "Ada", field_votes: 3 },
    },
    [itemIds[1]!]: {
      id: itemIds[1]!,
      kind: "shape",
      type: candidate,
      fields: { field_name: "Grace", field_votes: 1 },
    },
    [arrayId]: {
      id: arrayId,
      kind: "array",
      type: candidates,
      items: itemIds.map((ref) => ({ ref })),
    },
  };
  const barBlock: Block = {
    id: "row",
    name: "Row",
    canvas: {
      id: "row-canvas",
      kind: "block",
      root: {
        id: "row-root",
        type: "frame",
        children: [
          {
            id: "bar",
            type: "rect",
            sizing: {
              width: {
                mode: "fixed",
                value: {
                  kind: "formula",
                  formula: "item.votes / Total * 100",
                  fallback: { value: 0, unit: "%" },
                  unit: "%",
                },
              },
            },
          },
        ],
      },
    },
    variables: [
      { id: "candidate", name: "Candidate", type: candidate, required: true },
      { id: "total", name: "Total", type: "number", required: true },
    ],
    states: [],
  };
  const tallyGraph = {
    nodes: [
      {
        id: "source_candidates",
        kind: "source",
        name: "Candidates",
        parentId: null,
        position: { x: 0, y: 0 },
        type: candidates,
      },
      {
        id: "tally",
        kind: "scene",
        name: "Tally",
        parentId: null,
        position: { x: 0, y: 0 },
        variables: [
          { id: "var_candidates", name: "Candidates", type: candidates },
          { id: "var_total", name: "Total", type: "number", defaultValue: 4 },
        ],
      },
    ],
    edges: [
      {
        id: "edge_candidates",
        kind: "wiring",
        sourceId: "source_candidates",
        targetId: "tally",
        sourcePath: [],
        targetPath: ["var_candidates"],
      },
    ],
    shapes: [
      {
        id: "shape_candidate",
        name: "Candidate",
        fields: [
          { id: "field_name", name: "name", type: "text", required: true, defaultValue: "" },
          { id: "field_votes", name: "votes", type: "number", required: true, defaultValue: 0 },
        ],
      },
    ],
    blocks: [barBlock],
  } satisfies ShowGraph;
  const tallyCanvas = {
    kind: "scene" as const,
    root: {
      id: "tally-root",
      type: "frame" as const,
      children: [
        {
          id: "tally-slot",
          type: "slot" as const,
          blockId: barBlock.id,
          expansion: { source: { kind: "variable" as const, variableId: "var_candidates" } },
          assignments: [
            { variableId: "candidate", source: { kind: "runtimeItem" as const } },
            {
              variableId: "total",
              source: { kind: "variable" as const, variableId: "var_total" },
            },
          ],
        },
      ],
    },
  };

  it("reads the expanded item, so each instance paints its own share", () => {
    const scene = tallyGraph.nodes.find((node) => node.id === "tally");
    if (scene?.kind !== "scene") throw new Error("Scene is missing.");
    const presentation = prepareCanvasPresentation({
      canvas: tallyCanvas,
      graph: tallyGraph,
      blocks: [barBlock],
      imageAssets: [],
      owner: {
        kind: "scene",
        scene,
        sourceValues: { source_candidates: { ref: arrayId } },
        structuredValues,
      },
      mode: "player",
    });
    const widths = presentation.root.children[0]?.slot?.instances.map(
      (instance) => instance.element?.children[0]?.element.sizing?.width?.value,
    );

    expect(widths).toEqual([
      { value: 75, unit: "%" },
      { value: 25, unit: "%" },
    ]);
  });
});

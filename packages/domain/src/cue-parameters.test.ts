import { describe, expect, it } from "vitest";

import { resolveCueParameters } from "./cue-parameters";
import type { Block } from "./blocks";
import type { Element } from "./canvas";
import type { ShowGraph } from "./graph";
import type { RuntimeEventParameterPlan } from "./interactions";
import type { RunState } from "./structured-values";

const SWATCH_SHAPE = "shape_swatch";
const LABEL_FIELD = "field_swatch_label";
// Structured Value ids are branded: `isStructuredValueReference` only accepts
// the real prefix and alphabet, so a readable stand-in would silently fail to
// dereference and read as a plain value instead.
const SWATCHES = "xswatch2";
const TEAL = "xteaa234";
const CORAL = "xcrra234";

const graph = {
  shapes: [
    {
      id: SWATCH_SHAPE,
      name: "Swatch",
      fields: [
        { id: LABEL_FIELD, name: "label", type: "text" as const, required: true, defaultValue: "" },
      ],
    },
  ],
  nodes: [
    {
      id: "source_swatches",
      kind: "source" as const,
      name: "Swatches",
      parentId: null,
      position: { x: 0, y: 0 },
      type: { kind: "array" as const, of: { kind: "shape" as const, shapeId: SWATCH_SHAPE } },
    },
    {
      id: "flow_pick",
      kind: "flow" as const,
      name: "Pick",
      parentId: null,
      position: { x: 0, y: 0 },
      defaultSceneId: "scene_list",
    },
    {
      id: "scene_list",
      kind: "scene" as const,
      name: "List",
      parentId: "flow_pick",
      position: { x: 0, y: 0 },
      variables: [
        {
          id: "variable_swatches",
          name: "Swatches",
          type: { kind: "array" as const, of: { kind: "shape" as const, shapeId: SWATCH_SHAPE } },
        },
      ],
    },
  ],
  edges: [
    {
      id: "edge_swatches",
      kind: "wiring" as const,
      sourceId: "source_swatches",
      targetId: "scene_list",
      sourcePath: [],
      targetPath: ["variable_swatches"],
    },
  ],
} as unknown as ShowGraph;

const block: Block = {
  id: "block_swatch",
  name: "Swatch",
  canvas: {
    id: "canvas_swatch",
    kind: "block",
    root: {
      id: "swatch_root",
      type: "frame",
      name: "Swatch",
      rank: "a",
      children: [],
    },
  },
  variables: [
    {
      id: "swatch_variable",
      name: "Swatch",
      type: { kind: "shape", shapeId: SWATCH_SHAPE },
      required: true,
    },
  ],
  states: [],
};

const canvas: { root: Element } = {
  root: {
    id: "scene_root",
    type: "frame",
    name: "Root",
    rank: "a",
    children: [
      {
        id: "swatch_slot",
        type: "slot",
        rank: "a",
        blockId: "block_swatch",
        expansion: { source: { kind: "variable", variableId: "variable_swatches" } },
        assignments: [{ variableId: "swatch_variable", source: { kind: "runtimeItem" } }],
      },
    ],
  } as Element,
};

const state: RunState = {
  sourceValues: { source_swatches: { ref: SWATCHES } },
  structuredValues: {
    [SWATCHES]: {
      id: SWATCHES,
      kind: "array",
      type: { kind: "array", of: { kind: "shape", shapeId: SWATCH_SHAPE } },
      items: [{ ref: TEAL }, { ref: CORAL }],
    },
    [TEAL]: {
      id: TEAL,
      kind: "shape",
      type: { kind: "shape", shapeId: SWATCH_SHAPE },
      fields: { [LABEL_FIELD]: "Teal" },
    },
    [CORAL]: {
      id: CORAL,
      kind: "shape",
      type: { kind: "shape", shapeId: SWATCH_SHAPE },
      fields: { [LABEL_FIELD]: "Coral" },
    },
  },
} as unknown as RunState;

const relayed: RuntimeEventParameterPlan = {
  instancePath: [{ slotElementId: "swatch_slot", index: 1 }],
  bindingMappings: [
    { parameterId: "swatch", source: { kind: "variable", variableId: "swatch_variable" } },
  ],
  hops: [[{ sourceParameterId: "swatch", targetParameterId: "picked" }]],
};

function resolve(parameters: RuntimeEventParameterPlan) {
  return resolveCueParameters({
    graph,
    canvas,
    sceneId: "scene_list",
    state,
    blocks: [block],
    parameters,
  });
}

describe("resolveCueParameters", () => {
  it("carries the tapped instance's Shape as a reference, not a copy", () => {
    expect(resolve(relayed)).toEqual({
      kind: "resolved",
      values: { picked: { ref: CORAL } },
    });
  });

  it("distinguishes instances of the same Block by index", () => {
    const first = resolve({
      ...relayed,
      instancePath: [{ slotElementId: "swatch_slot", index: 0 }],
    });
    expect(first).toEqual({ kind: "resolved", values: { picked: { ref: TEAL } } });
  });

  it("reads a field path named by the relay hop", () => {
    expect(
      resolve({
        ...relayed,
        hops: [
          [
            {
              sourceParameterId: "swatch",
              targetParameterId: "picked",
              sourceFieldPath: [LABEL_FIELD],
            },
          ],
        ],
      }),
    ).toEqual({ kind: "resolved", values: { picked: "Coral" } });
  });

  it("resolves a Scene Canvas Binding's own mappings with no path to walk", () => {
    expect(
      resolve({
        instancePath: [],
        bindingMappings: [
          { parameterId: "all", source: { kind: "variable", variableId: "variable_swatches" } },
        ],
        hops: [],
      }),
    ).toEqual({ kind: "resolved", values: { all: { ref: SWATCHES } } });
  });

  it("reports an index past the end of the expansion", () => {
    expect(
      resolve({ ...relayed, instancePath: [{ slotElementId: "swatch_slot", index: 7 }] }),
    ).toEqual({ kind: "failed", reason: "slot-index-out-of-range" });
  });

  it("reports a Slot the Canvas no longer has", () => {
    expect(resolve({ ...relayed, instancePath: [{ slotElementId: "gone", index: 0 }] })).toEqual({
      kind: "failed",
      reason: "missing-slot-element",
    });
  });

  it("reports a Block the Show no longer has", () => {
    expect(
      resolveCueParameters({
        graph,
        canvas,
        sceneId: "scene_list",
        state,
        blocks: [],
        parameters: relayed,
      }),
    ).toEqual({ kind: "failed", reason: "missing-block" });
  });

  it("reports a Scene that is not in the graph", () => {
    expect(
      resolveCueParameters({
        graph,
        canvas,
        sceneId: "scene_gone",
        state,
        blocks: [block],
        parameters: relayed,
      }),
    ).toEqual({ kind: "failed", reason: "missing-scene" });
  });
});

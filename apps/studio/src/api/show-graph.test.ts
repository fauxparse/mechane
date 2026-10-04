import { applyGraphEdits, type GraphEdit } from "@mechane/commands";
import { decodeShowGraphDocument } from "@mechane/graphql-schema";
import { describe, expect, it } from "vitest";

import { patchShowGraphQueryData } from "./show-graph";

const graph = {
  nodes: [
    {
      __typename: "SceneNode",
      id: "scene-a",
      variables: [
        { id: "variable-a", name: "A" },
        { id: "variable-b", name: "B" },
      ],
    },
    { __typename: "SourceNode", id: "source-a" },
  ],
  edges: [],
  cues: [],
  actions: [],
  eventBindings: [],
} as unknown as Parameters<typeof patchShowGraphQueryData>[0];

const reorder: GraphEdit = {
  type: "graph.reorderSceneVariables",
  sceneId: "scene-a",
  variableIds: ["variable-b", "variable-a"],
};

const cachedCue = {
  id: "cue-old",
  name: "Old cue",
  ownerKind: "scene",
  sceneId: "scene-a",
  blockId: null,
  actionIds: ["action-old"],
  parameters: [],
};
const interactionGraph = {
  ...graph,
  cues: [cachedCue],
  actions: [
    {
      __typename: "NavigateAction",
      id: "action-old",
      cueId: "cue-old",
      kind: "navigate",
      targetSceneId: "scene-b",
      layout: null,
    },
  ],
  eventBindings: [
    {
      id: "binding-old",
      canvasId: "canvas-a",
      elementId: "button-a",
      eventKind: "tap",
      params: null,
      cueId: "cue-old",
      position: 0,
    },
  ],
} as unknown as Parameters<typeof patchShowGraphQueryData>[0];

const newCue: GraphEdit = {
  type: "graph.addCue",
  cue: {
    id: "cue-new",
    name: "New cue",
    owner: { kind: "scene", sceneId: "scene-a" },
    actionIds: [],
  },
};
const removeCachedCue: GraphEdit = {
  type: "graph.removeCue",
  cueId: "cue-old",
};
const sourceDefaultsGraph = {
  ...graph,
  sourceFieldDefaults: [
    { nodeId: "source-a", fieldPath: ["headline"], value: "Before" },
    { nodeId: "source-a", fieldPath: ["count"], value: 1 },
  ],
} as unknown as Parameters<typeof patchShowGraphQueryData>[0];
const setHeadline = (value: unknown): GraphEdit => ({
  type: "graph.setSourceFieldDefault",
  nodeId: "source-a",
  fieldPath: ["headline"],
  value,
});

// The cached draft as the Show graph query returns it: Shape Fields carry a
// `position` and their default arrives as the `ShapeValue` union.
const shapesGraph = {
  showId: "show-a",
  state: "draft",
  updatedAt: "2026-10-05T00:00:00.000Z",
  version: 1,
  nodes: [],
  edges: [],
  cues: [],
  actions: [],
  eventBindings: [],
  sourceFieldDefaults: [],
  shapes: [
    {
      id: "shape-person",
      name: "Person",
      fields: [
        {
          id: "field-age",
          name: "age",
          position: 1,
          required: false,
          type: { kind: "number", shapeId: null, of: null },
          default: { __typename: "NumberValue", numberValue: 30 },
        },
        {
          id: "field-name",
          name: "name",
          position: 0,
          required: true,
          type: { kind: "text", shapeId: null, of: null },
          default: { __typename: "TextValue", textValue: "Ada" },
        },
      ],
    },
  ],
} as unknown as Parameters<typeof patchShowGraphQueryData>[0];

// Every Shape edit the Shapes workspace sends, in an order that touches the
// new and the existing Shape alike.
const shapeEdits: GraphEdit[] = [
  {
    type: "graph.addShape",
    shape: {
      id: "shape-team",
      name: "New Shape",
      fields: [
        {
          id: "field-title",
          name: "title",
          type: "text",
          required: true,
          defaultValue: "Untitled",
        },
      ],
    },
  },
  { type: "graph.renameShape", shapeId: "shape-team", name: "Team" },
  {
    type: "graph.addShapeField",
    shapeId: "shape-team",
    field: {
      id: "field-members",
      name: "members",
      type: { kind: "array", of: { kind: "shape", shapeId: "shape-person" } },
      required: false,
      defaultValue: null,
    },
  },
  {
    type: "graph.renameShapeField",
    shapeId: "shape-person",
    fieldId: "field-age",
    name: "years",
  },
  {
    type: "graph.setShapeFieldType",
    shapeId: "shape-person",
    fieldId: "field-age",
    fieldType: "text",
  },
  {
    type: "graph.setShapeFieldDefault",
    shapeId: "shape-person",
    fieldId: "field-age",
    defaultValue: "thirty",
  },
  {
    type: "graph.setShapeFieldRequired",
    shapeId: "shape-person",
    fieldId: "field-name",
    required: false,
  },
  {
    type: "graph.reorderShapeFields",
    shapeId: "shape-person",
    fieldIds: ["field-age", "field-name"],
  },
  {
    type: "graph.duplicateShape",
    shape: { id: "shape-team-copy", name: "Team copy", fields: [] },
  },
  { type: "graph.removeShape", shapeId: "shape-team-copy" },
  { type: "graph.removeShapeField", shapeId: "shape-team", fieldId: "field-title" },
];

describe("patchShowGraphQueryData", () => {
  it("reorders the cached Scene Variables without refetching", () => {
    const patched = patchShowGraphQueryData(graph, [reorder]);
    const scene = patched?.nodes.find((node) => node.id === "scene-a");

    expect(scene?.variables?.map((variable) => variable.id)).toEqual(["variable-b", "variable-a"]);
    expect(patched?.nodes.find((node) => node.id === "source-a")).toBe(graph?.nodes[1]);
  });

  it("leaves the cache unchanged for an invalid cached order", () => {
    const patched = patchShowGraphQueryData(graph, [
      { ...reorder, variableIds: ["missing", "variable-a"] },
    ]);

    expect(patched).toBe(graph);
  });
  it("adds a newly-created Cue to the cached graph only once", () => {
    const patched = patchShowGraphQueryData(graph, [newCue]);
    const responsePatched = patchShowGraphQueryData(patched, [newCue]);

    expect(responsePatched).toBe(patched);
    expect(responsePatched?.cues.map((cue) => cue.id)).toEqual(["cue-new"]);
    expect(responsePatched?.cues[0]).toMatchObject({
      id: "cue-new",
      name: "New cue",
      ownerKind: "scene",
      sceneId: "scene-a",
      blockId: null,
      actionIds: [],
      parameters: [],
    });
  });

  it("removes a Cue and its dependent interactions from the cache only once", () => {
    const patched = patchShowGraphQueryData(interactionGraph, [removeCachedCue]);
    const responsePatched = patchShowGraphQueryData(patched, [removeCachedCue]);

    expect(responsePatched).toBe(patched);
    expect(responsePatched?.cues).toEqual([]);
    expect(responsePatched?.actions).toEqual([]);
    expect(responsePatched?.eventBindings).toEqual([]);
  });

  it("replaces a cached Source default only once", () => {
    const patched = patchShowGraphQueryData(sourceDefaultsGraph, [setHeadline("After")]);
    const responsePatched = patchShowGraphQueryData(patched, [setHeadline("After")]);

    expect(responsePatched).toBe(patched);
    expect(responsePatched?.sourceFieldDefaults).toEqual([
      { nodeId: "source-a", fieldPath: ["count"], value: 1 },
      { nodeId: "source-a", fieldPath: ["headline"], value: "After" },
    ]);
  });

  it("clears a cached Source default when the value is null", () => {
    const patched = patchShowGraphQueryData(sourceDefaultsGraph, [setHeadline(null)]);

    expect(patched?.sourceFieldDefaults).toEqual([
      { nodeId: "source-a", fieldPath: ["count"], value: 1 },
    ]);
    expect(patchShowGraphQueryData(patched, [setHeadline(null)])).toBe(patched);
  });

  // A Show Editor reopened after the Shapes workspace decodes this cache, so
  // it must decode to the Shapes the commands themselves produced.
  it("mirrors Shape edits into the cached draft", () => {
    const patched = patchShowGraphQueryData(shapesGraph, shapeEdits);

    expect(decodeShowGraphDocument(patched).graph.shapes).toEqual(
      applyGraphEdits(decodeShowGraphDocument(shapesGraph).graph, shapeEdits).shapes,
    );
  });

  // The save response patches the batch again over the optimistic patch.
  it("applies Shape edits to the cache only once", () => {
    const patched = patchShowGraphQueryData(shapesGraph, shapeEdits);
    const responsePatched = patchShowGraphQueryData(patched, shapeEdits);

    expect(decodeShowGraphDocument(responsePatched).graph.shapes).toEqual(
      decodeShowGraphDocument(patched).graph.shapes,
    );
  });

  it("replaces every cached Shape for a whole-set edit", () => {
    const shapes = applyGraphEdits(decodeShowGraphDocument(shapesGraph).graph, shapeEdits).shapes;
    const patched = patchShowGraphQueryData(shapesGraph, [
      { type: "graph.setShapes", shapes: shapes ?? [] },
    ]);

    expect(decodeShowGraphDocument(patched).graph.shapes).toEqual(shapes);
  });
});

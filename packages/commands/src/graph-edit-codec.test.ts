// The test the six hand-maintained tables could never have (#347).
//
// One fixture per `GraphEdit` type, and one assertion over all of them:
// `decode(encode(edit))` is the edit. The fixture map is keyed by the same
// union the codec record is, so an edit variant with no fixture doesn't
// compile — which is what keeps this honest as the vocabulary grows.
//
// Each fixture is deliberately *maximal*: every optional field populated,
// because the bug this replaced was a field that only travelled one way. An
// edit whose fixture leaves a field out proves nothing about that field.

import { describe, expect, it } from "vitest";
import type { SceneNode } from "@mechane/domain";
import { emptyBlock } from "@mechane/domain";
import type { GraphEdit } from "./graph-edits";
import {
  decodeGraphEdit,
  encodeGraphEdit,
  GRAPH_EDIT_CODECS,
  GraphEditCodecError,
} from "./graph-edit-codec";

const SCENE_WITH_EVERYTHING: SceneNode = {
  kind: "scene",
  id: "scene_lobby",
  name: "Lobby",
  parentId: "flow_vote",
  color: "purple",
  position: { x: 12, y: 34 },
  variables: [
    {
      id: "variable_tally",
      name: "tally",
      rank: "a1",
      type: { kind: "shape", shapeId: "shape_vote" },
    },
    {
      id: "variable_poster",
      name: "poster",
      rank: "a2",
      type: "image",
      suggestedDimensions: { width: 1920, height: 1080 },
    },
  ],
};

const ADD_SCENE: Extract<GraphEdit, { type: "graph.addNode" }> = {
  type: "graph.addNode",
  node: SCENE_WITH_EVERYTHING,
};

const FIXTURES: { [T in GraphEdit["type"]]: Extract<GraphEdit, { type: T }> } = {
  "graph.addNode": ADD_SCENE,
  "graph.removeNode": { type: "graph.removeNode", nodeId: "scene_lobby" },
  "graph.setEdgeLayout": {
    type: "graph.setEdgeLayout",
    edgeId: "edge_1",
    layout: { HVH: { "1": -24 }, HVHVH: { "1": 8, "3": -16 } },
  },
  "graph.moveNode": { type: "graph.moveNode", nodeId: "scene_lobby", position: { x: 1, y: 2 } },
  "graph.renameNode": { type: "graph.renameNode", nodeId: "scene_lobby", name: "Foyer" },
  "graph.reparentNode": {
    type: "graph.reparentNode",
    nodeId: "scene_lobby",
    parentId: "flow_vote",
    position: { x: 3, y: 4 },
  },
  "graph.addEdge": {
    type: "graph.addEdge",
    edge: {
      kind: "wiring",
      id: "edge_tally",
      sourceId: "source_votes",
      targetId: "scene_lobby",
      sourcePath: ["count"],
      targetPath: ["variable_tally"],
      fieldMapping: { count: "total" },
    },
  },
  "graph.removeEdge": { type: "graph.removeEdge", edgeId: "edge_tally" },
  "graph.setSourceType": {
    type: "graph.setSourceType",
    nodeId: "source_votes",
    sourceType: { kind: "shape", shapeId: "shape_vote" },
  },
  "graph.setWiringFieldMapping": {
    type: "graph.setWiringFieldMapping",
    edgeId: "edge_tally",
    fieldMapping: { field_count: "field_total" },
  },
  "graph.setFlowDefaultScene": {
    type: "graph.setFlowDefaultScene",
    flowId: "flow_vote",
    sceneId: "scene_lobby",
  },
  "graph.setNodeColor": { type: "graph.setNodeColor", nodeId: "flow_vote", color: "purple" },
  "graph.setShapes": {
    type: "graph.setShapes",
    shapes: [
      {
        id: "shape_vote",
        name: "Vote",
        fields: [
          { id: "field_count", name: "count", type: "number", required: true, defaultValue: 0 },
          {
            id: "field_options",
            name: "options",
            type: { kind: "array", of: "text" },
            required: false,
            defaultValue: null,
          },
        ],
      },
    ],
  },
  "graph.addShape": {
    type: "graph.addShape",
    shape: {
      id: "shape_vote",
      name: "Vote",
      fields: [],
    },
  },
  "graph.renameShape": { type: "graph.renameShape", shapeId: "shape_vote", name: "Ballot" },
  "graph.duplicateShape": {
    type: "graph.duplicateShape",
    shape: {
      id: "shape_vote_copy",
      name: "Vote copy",
      fields: [],
    },
  },
  "graph.removeShape": { type: "graph.removeShape", shapeId: "shape_vote" },
  "graph.addShapeField": {
    type: "graph.addShapeField",
    shapeId: "shape_vote",
    field: {
      id: "field_count",
      name: "count",
      type: "number",
      required: true,
      defaultValue: 0,
    },
  },
  "graph.renameShapeField": {
    type: "graph.renameShapeField",
    shapeId: "shape_vote",
    fieldId: "field_count",
    name: "total",
  },
  "graph.setShapeFieldType": {
    type: "graph.setShapeFieldType",
    shapeId: "shape_vote",
    fieldId: "field_count",
    fieldType: "text",
  },
  "graph.setShapeFieldDefault": {
    type: "graph.setShapeFieldDefault",
    shapeId: "shape_vote",
    fieldId: "field_count",
    defaultValue: 7,
  },
  "graph.setShapeFieldRequired": {
    type: "graph.setShapeFieldRequired",
    shapeId: "shape_vote",
    fieldId: "field_count",
    required: false,
  },
  "graph.reorderShapeFields": {
    type: "graph.reorderShapeFields",
    shapeId: "shape_vote",
    fieldIds: ["field_options", "field_count"],
  },
  "graph.removeShapeField": {
    type: "graph.removeShapeField",
    shapeId: "shape_vote",
    fieldId: "field_count",
  },
  "graph.setSourceFieldDefault": {
    type: "graph.setSourceFieldDefault",
    nodeId: "source_votes",
    fieldPath: ["count"],
    value: 7,
  },
  "graph.addSceneVariable": {
    type: "graph.addSceneVariable",
    sceneId: "scene_lobby",
    variable: {
      id: "variable_poster",
      name: "poster",
      rank: "a3",
      type: "image",
      suggestedDimensions: { width: 800, height: 600 },
    },
  },
  "graph.reorderSceneVariables": {
    type: "graph.reorderSceneVariables",
    sceneId: "scene_lobby",
    variableIds: ["variable_poster", "variable_tally"],
  },
  "graph.renameSceneVariable": {
    type: "graph.renameSceneVariable",
    sceneId: "scene_lobby",
    variableId: "variable_tally",
    name: "total",
  },
  "graph.setSceneVariableType": {
    type: "graph.setSceneVariableType",
    sceneId: "scene_lobby",
    variableId: "variable_tally",
    variableType: { kind: "array", of: { kind: "shape", shapeId: "shape_vote" } },
  },
  "graph.setSceneVariableDefault": {
    type: "graph.setSceneVariableDefault",
    sceneId: "scene_lobby",
    variableId: "variable_tally",
    defaultValue: { total: 42 },
  },
  "graph.removeSceneVariable": {
    type: "graph.removeSceneVariable",
    sceneId: "scene_lobby",
    variableId: "variable_tally",
  },
  "graph.setDevicePairingCode": {
    type: "graph.setDevicePairingCode",
    nodeId: "device_projector",
    pairingCode: "BUZZ42",
  },
  "graph.setDevicePerConnection": {
    type: "graph.setDevicePerConnection",
    nodeId: "device_phones",
    perConnection: true,
  },
  "graph.addBlock": { type: "graph.addBlock", block: emptyBlock("Banner") },
  "graph.setBlockVariables": {
    type: "graph.setBlockVariables",
    blockId: "block_banner",
    variables: [
      {
        id: "variable_title",
        name: "Title",
        type: "text",
        required: false,
        defaultValue: "Banner",
      },
    ],
  },
  "graph.renameBlock": { type: "graph.renameBlock", blockId: "block_banner", name: "Hero" },
  "graph.duplicateBlock": {
    type: "graph.duplicateBlock",
    block: emptyBlock("Banner copy"),
  },
  "graph.removeBlock": { type: "graph.removeBlock", blockId: "block_banner" },
};

describe("graph edit codec", () => {
  it("has a descriptor for every edit type", () => {
    expect(Object.keys(GRAPH_EDIT_CODECS).sort()).toEqual(Object.keys(FIXTURES).sort());
  });

  it.each(Object.keys(FIXTURES) as GraphEdit["type"][])("round-trips %s", (type) => {
    const edit = FIXTURES[type];
    expect(decodeGraphEdit(encodeGraphEdit(edit))).toEqual(edit);
  });

  // The regression that motivated the module: a Scene restored by undo
  // (ADR-0005 sends it as an ordinary graph.addNode) used to lose its
  // Variables' rank on the way in and their suggestedDimensions on the way
  // out, because the two transcriptions were written separately.
  it("keeps every Scene Variable field a restored Scene carries", () => {
    const restored = decodeGraphEdit(encodeGraphEdit(ADD_SCENE));
    if (restored.type !== "graph.addNode" || restored.node.kind !== "scene") {
      throw new Error("expected a Scene node");
    }
    expect(restored.node.variables).toEqual(SCENE_WITH_EVERYTHING.variables);
  });

  describe("decoding", () => {
    it("refuses an edit type it has never heard of", () => {
      expect(() => decodeGraphEdit({ type: "graph.explode" })).toThrow(GraphEditCodecError);
    });

    it("refuses an edit missing a field its type needs", () => {
      expect(() => decodeGraphEdit({ type: "graph.renameNode", nodeId: "scene_lobby" })).toThrow(
        /needs a name/,
      );
    });

    it("distinguishes clearing a Variable's Type from saying nothing about it", () => {
      expect(
        decodeGraphEdit({
          type: "graph.setSceneVariableType",
          sceneId: "scene_lobby",
          variableId: "variable_tally",
          variableType: null,
        }),
      ).toEqual({
        type: "graph.setSceneVariableType",
        sceneId: "scene_lobby",
        variableId: "variable_tally",
        variableType: null,
      });
      expect(() =>
        decodeGraphEdit({
          type: "graph.setSceneVariableType",
          sceneId: "scene_lobby",
          variableId: "variable_tally",
        }),
      ).toThrow(/needs a variableType/);
    });

    it("reads a reparent to Show level as null, not as a missing field", () => {
      expect(
        decodeGraphEdit({
          type: "graph.reparentNode",
          nodeId: "scene_lobby",
          position: { x: 0, y: 0 },
        }),
      ).toMatchObject({ parentId: null });
    });

    it("distinguishes clearing a node's color from saying nothing about it", () => {
      expect(
        decodeGraphEdit({ type: "graph.setNodeColor", nodeId: "flow_vote", color: null }),
      ).toEqual({ type: "graph.setNodeColor", nodeId: "flow_vote", color: null });
      expect(() => decodeGraphEdit({ type: "graph.setNodeColor", nodeId: "flow_vote" })).toThrow(
        /needs a color/,
      );
    });

    it("refuses a Flow color nothing knows", () => {
      expect(() =>
        decodeGraphEdit({ type: "graph.setNodeColor", nodeId: "flow_vote", color: "beige" }),
      ).toThrow(GraphEditCodecError);
    });

    it("restores Shape Field order from the position it travelled with", () => {
      const encoded = encodeGraphEdit(FIXTURES["graph.setShapes"]);
      const shuffled = {
        ...encoded,
        shapes: encoded.shapes?.map((shape) => ({ ...shape, fields: [...shape.fields].reverse() })),
      };
      expect(decodeGraphEdit(shuffled)).toEqual(FIXTURES["graph.setShapes"]);
    });
  });
});

// The envelope checks on an edit off the wire (#103). No database: these are
// about whether one JSON object is a well-formed edit, which is the whole of
// what this boundary decides — whether the *graph* accepts it is the command
// layer's answer, given when the batch is applied.
import { GRAPH_COMMAND_TYPES, type FlatGraphEdit } from "@mechane/commands";
import { GraphQLError } from "graphql";
import { describe, expect, it } from "vitest";

import {
  parseGraphEdit,
  resolveGraphEdgeType,
  resolveGraphNodeType,
  serializeGraphEdit,
} from "./show-graph";

describe("GraphNode interface resolution", () => {
  it.each([
    ["scene", "SceneNode"],
    ["flow", "FlowNode"],
    ["source", "SourceNode"],
    ["transformer", "TransformerNode"],
    ["device", "DeviceNode"],
  ] as const)("maps %s to %s", (kind, typeName) => {
    expect(resolveGraphNodeType({ kind })).toBe(typeName);
  });

  it("refuses an unknown domain kind", () => {
    expect(() => resolveGraphNodeType({ kind: "hologram" } as never)).toThrow(
      /Unknown graph node kind/,
    );
  });
});

describe("GraphEdge interface resolution", () => {
  it.each([
    ["wiring", "WiringEdge"],
    ["navigate", "NavigateEdge"],
    ["device", "DeviceEdge"],
  ] as const)("maps %s to %s", (kind, typeName) => {
    expect(resolveGraphEdgeType({ kind })).toBe(typeName);
  });

  it("refuses an unknown domain kind", () => {
    expect(() => resolveGraphEdgeType({ kind: "telepathy" } as never)).toThrow(
      /Unknown graph edge kind/,
    );
  });
});

const NODE = {
  id: "scene_lobby",
  kind: "scene",
  name: "Lobby",
  position: { x: 1, y: 2 },
  variables: [{ id: "variable_prompt", name: "prompt" }],
};

describe("parseGraphEdit", () => {
  it("unflattens a node into the domain's discriminated union", () => {
    expect(parseGraphEdit({ type: GRAPH_COMMAND_TYPES.addNode, node: NODE })).toEqual({
      type: "graph.addNode",
      node: {
        id: "scene_lobby",
        kind: "scene",
        name: "Lobby",
        parentId: null,
        position: { x: 1, y: 2 },
        variables: [{ id: "variable_prompt", name: "prompt" }],
      },
    });
  });

  it("keeps a null parentId, which means Show level rather than 'unspecified'", () => {
    expect(
      parseGraphEdit({
        type: GRAPH_COMMAND_TYPES.reparentNode,
        nodeId: "scene_lobby",
        position: { x: 0, y: 0 },
      }),
    ).toEqual({
      type: "graph.reparentNode",
      nodeId: "scene_lobby",
      parentId: null,
      position: { x: 0, y: 0 },
    });
  });

  it("keeps a null default Scene, which means clearing it", () => {
    expect(
      parseGraphEdit({ type: GRAPH_COMMAND_TYPES.setFlowDefaultScene, flowId: "flow_a" }),
    ).toEqual({ type: "graph.setFlowDefaultScene", flowId: "flow_a", sceneId: null });
  });

  it("parses a Device per-connection edit, including false", () => {
    expect(
      parseGraphEdit({
        type: GRAPH_COMMAND_TYPES.setDevicePerConnection,
        nodeId: "device_phone",
        perConnection: false,
      }),
    ).toEqual({
      type: "graph.setDevicePerConnection",
      nodeId: "device_phone",
      perConnection: false,
    });
  });
  it("parses a Scene Variable reorder edit", () => {
    expect(
      parseGraphEdit({
        type: GRAPH_COMMAND_TYPES.reorderSceneVariables,
        sceneId: "scene_a",
        variableIds: ["variable_b", "variable_a"],
      }),
    ).toEqual({
      type: "graph.reorderSceneVariables",
      sceneId: "scene_a",
      variableIds: ["variable_b", "variable_a"],
    });
  });

  it("parses a color edit for any node", () => {
    expect(
      parseGraphEdit({
        type: GRAPH_COMMAND_TYPES.setNodeColor,
        nodeId: "scene_a",
        color: "purple",
      }),
    ).toEqual({ type: "graph.setNodeColor", nodeId: "scene_a", color: "purple" });
  });

  it("parses Shape definition edits with ordered Fields", () => {
    expect(
      parseGraphEdit({
        type: GRAPH_COMMAND_TYPES.setShapes,
        shapes: [
          {
            id: "shape_vote",
            name: "Vote",
            fields: [
              {
                id: "field_count",
                name: "count",
                type: { kind: "number" },
                position: 1,
                required: true,
                defaultValue: 0,
              },
            ],
          },
        ],
      }),
    ).toEqual({
      type: "graph.setShapes",
      shapes: [
        {
          id: "shape_vote",
          name: "Vote",
          fields: [
            { id: "field_count", name: "count", type: "number", required: true, defaultValue: 0 },
          ],
        },
      ],
    });
  });

  it("rejects an anonymous object Variable type", () => {
    expect(() =>
      parseGraphEdit({
        type: GRAPH_COMMAND_TYPES.setSceneVariableType,
        sceneId: "scene_a",
        variableId: "variable_a",
        variableType: { kind: "object" },
      }),
    ).toThrow('Invalid Shape type "object".');
  });

  it("parses a node color clear for undo", () => {
    expect(
      parseGraphEdit({
        type: GRAPH_COMMAND_TYPES.setNodeColor,
        nodeId: "scene_a",
        color: null,
      }),
    ).toEqual({ type: "graph.setNodeColor", nodeId: "scene_a", color: null });
  });
  it("preserves a null Source value, which clears the override", () => {
    expect(
      parseGraphEdit({
        type: GRAPH_COMMAND_TYPES.setSourceFieldDefault,
        nodeId: "source_a",
        fieldPath: ["field_title"],
        value: null,
      }),
    ).toEqual({
      type: "graph.setSourceFieldDefault",
      nodeId: "source_a",
      fieldPath: ["field_title"],
      value: null,
    });
  });

  it("rejects an unknown node color", () => {
    expect(() =>
      parseGraphEdit({
        type: GRAPH_COMMAND_TYPES.setNodeColor,
        nodeId: "scene_a",
        color: "pink",
      }),
    ).toThrow(GraphQLError);
  });

  it.each([
    ["a node", { type: GRAPH_COMMAND_TYPES.addNode }],
    ["a nodeId", { type: GRAPH_COMMAND_TYPES.removeNode }],
    ["a position", { type: GRAPH_COMMAND_TYPES.moveNode, nodeId: "scene_lobby" }],
    ["a name", { type: GRAPH_COMMAND_TYPES.renameNode, nodeId: "scene_lobby" }],
    ["an edge", { type: GRAPH_COMMAND_TYPES.addEdge }],
    ["an edgeId", { type: GRAPH_COMMAND_TYPES.removeEdge }],
    ["a flowId", { type: GRAPH_COMMAND_TYPES.setFlowDefaultScene }],
    ["a node color", { type: GRAPH_COMMAND_TYPES.setNodeColor, nodeId: "scene_lobby" }],
    ["a variable", { type: GRAPH_COMMAND_TYPES.addSceneVariable, sceneId: "scene_lobby" }],
    ["variableIds", { type: GRAPH_COMMAND_TYPES.reorderSceneVariables, sceneId: "scene_lobby" }],
    ["a variableId", { type: GRAPH_COMMAND_TYPES.removeSceneVariable, sceneId: "scene_lobby" }],
    [
      "a variableType",
      { type: GRAPH_COMMAND_TYPES.setSceneVariableType, sceneId: "scene_lobby", variableId: "v" },
    ],
    ["perConnection", { type: GRAPH_COMMAND_TYPES.setDevicePerConnection, nodeId: "device_phone" }],
  ])("refuses an edit missing %s", (_what, edit) => {
    expect(() => parseGraphEdit(edit as FlatGraphEdit)).toThrow(GraphQLError);
  });

  it("refuses an edit type it doesn't know, rather than ignoring it", () => {
    // Skipping it would leave the client believing in a graph the server
    // never built — worse than refusing the batch.
    expect(() => parseGraphEdit({ type: "graph.explode" })).toThrow(/Unknown Show graph edit/);
  });

  it("reports a bad edit as user input, not as a server error", () => {
    try {
      parseGraphEdit({ type: GRAPH_COMMAND_TYPES.renameNode, nodeId: "scene_lobby" });
      expect.unreachable();
    } catch (error) {
      expect((error as GraphQLError).extensions.code).toBe("BAD_USER_INPUT");
    }
  });
});

describe("pairing codes are the server's (#45, #111)", () => {
  it("refuses an edit that tries to set one", () => {
    // The input type has no `pairingCode` field at all, so this can't arrive
    // with a code attached — but naming the type is a misunderstanding worth
    // correcting rather than ignoring.
    expect(() =>
      parseGraphEdit({ type: "graph.setDevicePairingCode", nodeId: "device_phone" }),
    ).toThrow(/minted server-side/);
  });

  it("sends one out as an amendment", () => {
    expect(
      serializeGraphEdit({
        type: "graph.setDevicePairingCode",
        nodeId: "device_phone",
        pairingCode: "AB12C",
      }),
    ).toMatchObject({
      type: "graph.setDevicePairingCode",
      nodeId: "device_phone",
      pairingCode: "AB12C",
      // Everything an amendment of this type isn't about comes back null,
      // because one flat type covers every edit (GraphQL has no unions here).
      name: null,
      node: null,
    });
  });
});

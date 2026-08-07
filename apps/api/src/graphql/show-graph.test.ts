// The envelope checks on an edit off the wire (#103). No database: these are
// about whether one JSON object is a well-formed edit, which is the whole of
// what this boundary decides — whether the *graph* accepts it is the command
// layer's answer, given when the batch is applied.
import { GRAPH_COMMAND_TYPES } from "@mechane/commands";
import { GraphQLError } from "graphql";
import { describe, expect, it } from "vitest";

import { parseGraphEdit } from "./show-graph";
import type { GraphEditInput } from "./show-graph";

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

  it.each([
    ["a node", { type: GRAPH_COMMAND_TYPES.addNode }],
    ["a nodeId", { type: GRAPH_COMMAND_TYPES.removeNode }],
    ["a position", { type: GRAPH_COMMAND_TYPES.moveNode, nodeId: "scene_lobby" }],
    ["a name", { type: GRAPH_COMMAND_TYPES.renameNode, nodeId: "scene_lobby" }],
    ["an edge", { type: GRAPH_COMMAND_TYPES.addEdge }],
    ["an edgeId", { type: GRAPH_COMMAND_TYPES.removeEdge }],
    ["a flowId", { type: GRAPH_COMMAND_TYPES.setFlowDefaultScene }],
    ["a variable", { type: GRAPH_COMMAND_TYPES.addSceneVariable, sceneId: "scene_lobby" }],
    ["a variableId", { type: GRAPH_COMMAND_TYPES.removeSceneVariable, sceneId: "scene_lobby" }],
  ])("refuses an edit missing %s", (_what, edit) => {
    expect(() => parseGraphEdit(edit as GraphEditInput)).toThrow(GraphQLError);
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

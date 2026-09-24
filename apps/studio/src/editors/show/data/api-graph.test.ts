import { describe, expect, it } from "vitest";

import { toEditInput, toGraphEdit } from "./api-graph";

describe("toEditInput", () => {
  it("sends only what an edit's type is about", () => {
    expect(toEditInput({ type: "graph.removeNode", nodeId: "scene_lobby" })).toEqual({
      type: "graph.removeNode",
      nodeId: "scene_lobby",
    });
    expect(
      toEditInput({
        type: "graph.setFlowSize",
        flowId: "flow_vote",
        size: { width: 640, height: 480 },
      }),
    ).toEqual({
      type: "graph.setFlowSize",
      flowId: "flow_vote",
      size: { width: 640, height: 480 },
    });
    expect(
      toEditInput({
        type: "graph.renameSceneVariable",
        sceneId: "s",
        variableId: "v",
        name: "n",
      }),
    ).toEqual({ type: "graph.renameSceneVariable", sceneId: "s", variableId: "v", name: "n" });
    expect(
      toEditInput({
        type: "graph.setSceneVariableType",
        sceneId: "s",
        variableId: "v",
        variableType: { kind: "shape", shapeId: "profile" },
      }),
    ).toEqual({
      type: "graph.setSceneVariableType",
      sceneId: "s",
      variableId: "v",
      variableType: { kind: "shape", shapeId: "profile" },
    });
    expect(
      toEditInput({
        type: "graph.reorderSceneVariables",
        sceneId: "s",
        variableIds: ["b", "a"],
      }),
    ).toEqual({
      type: "graph.reorderSceneVariables",
      sceneId: "s",
      variableIds: ["b", "a"],
    });
  });

  it("carries the nulls that mean something", () => {
    // "Out to Show level" and "no entry Scene" are values, not omissions.
    expect(
      toEditInput({
        type: "graph.reparentNode",
        nodeId: "scene_lobby",
        parentId: null,
        position: { x: 0, y: 0 },
      }),
    ).toMatchObject({ parentId: null });
    expect(
      toEditInput({ type: "graph.setFlowDefaultScene", flowId: "flow_vote", sceneId: null }),
    ).toMatchObject({ sceneId: null });
  });
  it("carries Canvas targets and edits to the mutation input", () => {
    expect(
      toEditInput({
        canvasId: "scene_lobby",
        edit: {
          type: "canvas.updateElement",
          elementId: "title",
          properties: { content: "Updated" },
          unsetProperties: ["opacity"],
        },
      }),
    ).toEqual({
      type: "canvas.updateElement",
      canvasId: "scene_lobby",
      elementId: "title",
      properties: { content: "Updated" },
      unsetProperties: ["opacity"],
    });
  });

  it("doesn't send a pairing code, which is the server's to mint (#45)", () => {
    const input = toEditInput({
      type: "graph.addNode",
      node: {
        id: "device_phone",
        kind: "device",
        name: "Phones",
        parentId: null,
        position: { x: 0, y: 0 },
        perConnection: true,
        pairingCode: "AB12C",
      },
    });
    expect(input.node).not.toHaveProperty("pairingCode");
    expect(input.node).toMatchObject({ perConnection: true });
  });
});

describe("toGraphEdit", () => {
  it("reads a minted pairing code back as an edit the editor can apply", () => {
    expect(
      toGraphEdit({
        type: "graph.setDevicePairingCode",
        nodeId: "device_phone",
        pairingCode: "AB12C",
      }),
    ).toEqual({
      type: "graph.setDevicePairingCode",
      nodeId: "device_phone",
      pairingCode: "AB12C",
    });
  });

  it("refuses an amendment this build doesn't understand", () => {
    // A server ahead of this client. Applying half of what it sent would put
    // the editor on a graph neither of them believes in.
    expect(() => toGraphEdit({ type: "graph.explode", nodeId: null, pairingCode: null })).toThrow(
      /Unknown Show graph edit/,
    );
  });

  it("won't send a pairing code back the other way", () => {
    expect(() =>
      toEditInput({
        type: "graph.setDevicePairingCode",
        nodeId: "device_phone",
        pairingCode: "AB12C",
      }),
    ).toThrow(/server's to mint/);
  });

  it("sends a Device per-connection edit", () => {
    expect(
      toEditInput({
        type: "graph.setDevicePerConnection",
        nodeId: "device_phone",
        perConnection: true,
      }),
    ).toEqual({
      type: "graph.setDevicePerConnection",
      nodeId: "device_phone",
      perConnection: true,
    });
  });
});

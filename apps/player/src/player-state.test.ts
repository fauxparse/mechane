import { describe, expect, it } from "vitest";

import type { ShowGraph } from "@mechane/domain";
import { sceneVariableValues } from "./player-state";

const graph: ShowGraph = {
  shapes: [
    {
      id: "votes",
      name: "Votes",
      fields: [
        {
          id: "count",
          name: "Count",
          type: "number",
          required: true,
          defaultValue: null,
        },
      ],
    },
  ],
  nodes: [
    {
      id: "source_votes",
      kind: "source",
      name: "Votes",
      parentId: null,
      position: { x: 0, y: 0 },
      type: { kind: "shape", shapeId: "votes" },
    },
    {
      id: "scene_vote",
      kind: "scene",
      name: "Vote",
      parentId: null,
      position: { x: 0, y: 0 },
      variables: [{ id: "variable_total", name: "Total" }],
    },
  ],
  edges: [
    {
      id: "edge_votes",
      kind: "wiring",
      sourceId: "source_votes",
      targetId: "scene_vote",
      sourcePath: ["count"],
      targetPath: ["variable_total", "value"],
    },
  ],
  sourceFieldDefaults: [{ nodeId: "source_votes", fieldPath: ["count"], value: 7 }],
};

const mappedGraph: ShowGraph = {
  shapes: [
    {
      id: "source_shape",
      name: "Source",
      fields: [
        { id: "source_name", name: "Name", type: "text", required: true, defaultValue: null },
        { id: "source_score", name: "Score", type: "number", required: true, defaultValue: null },
      ],
    },
    {
      id: "target_shape",
      name: "Target",
      fields: [
        { id: "target_name", name: "Name", type: "text", required: true, defaultValue: null },
        { id: "target_score", name: "Score", type: "number", required: true, defaultValue: null },
      ],
    },
  ],
  nodes: [
    {
      id: "source_profile",
      kind: "source",
      name: "Profile",
      parentId: null,
      position: { x: 0, y: 0 },
      type: { kind: "shape", shapeId: "source_shape" },
    },
    {
      id: "scene_profile",
      kind: "scene",
      name: "Profile",
      parentId: null,
      position: { x: 0, y: 0 },
      variables: [
        {
          id: "variable_profile",
          name: "Profile",
          type: { kind: "shape", shapeId: "target_shape" },
        },
      ],
    },
  ],
  edges: [
    {
      id: "edge_profile",
      kind: "wiring",
      sourceId: "source_profile",
      targetId: "scene_profile",
      sourcePath: [],
      targetPath: ["variable_profile"],
      fieldMapping: { source_name: "target_name", source_score: "target_score" },
    },
  ],
};

const sourceChainGraph: ShowGraph = {
  nodes: [
    {
      id: "source_upstream",
      kind: "source",
      name: "Upstream",
      parentId: null,
      position: { x: 0, y: 0 },
      type: "text",
    },
    {
      id: "source_downstream",
      kind: "source",
      name: "Downstream",
      parentId: null,
      position: { x: 0, y: 0 },
      type: "text",
    },
    {
      id: "scene_chain",
      kind: "scene",
      name: "Chain",
      parentId: null,
      position: { x: 0, y: 0 },
      variables: [{ id: "variable_chain", name: "Chain", type: "text" }],
    },
  ],
  edges: [
    {
      id: "edge_source_chain",
      kind: "wiring",
      sourceId: "source_upstream",
      targetId: "source_downstream",
      sourcePath: [],
      targetPath: [],
    },
    {
      id: "edge_chain_scene",
      kind: "wiring",
      sourceId: "source_downstream",
      targetId: "scene_chain",
      sourcePath: [],
      targetPath: ["variable_chain"],
    },
  ],
};

const deviceGraph: ShowGraph = {
  nodes: [
    {
      id: "device_audience",
      kind: "device",
      name: "Audience",
      parentId: null,
      position: { x: 0, y: 0 },
      perConnection: false,
      pairingCode: "PAIR5",
    },
    {
      id: "source_pairing",
      kind: "source",
      name: "Pairing",
      parentId: null,
      position: { x: 0, y: 0 },
      type: "text",
    },
    {
      id: "scene_device",
      kind: "scene",
      name: "Device",
      parentId: null,
      position: { x: 0, y: 0 },
      variables: [
        { id: "variable_pairing", name: "Pairing", type: "text" },
        { id: "variable_qr", name: "QR", type: "image" },
      ],
    },
  ],
  edges: [
    {
      id: "edge_pairing_source",
      kind: "wiring",
      sourceId: "device_audience",
      targetId: "source_pairing",
      sourcePath: ["pairing-code"],
      targetPath: [],
    },
    {
      id: "edge_pairing_scene",
      kind: "wiring",
      sourceId: "source_pairing",
      targetId: "scene_device",
      sourcePath: [],
      targetPath: ["variable_pairing"],
    },
    {
      id: "edge_qr",
      kind: "wiring",
      sourceId: "device_audience",
      targetId: "scene_device",
      sourcePath: ["qr-code"],
      targetPath: ["variable_qr"],
    },
  ],
};

describe("sceneVariableValues", () => {
  it("falls back to design-time Source values for legacy primitive defaults", () => {
    expect(sceneVariableValues(graph, "scene_vote", { source_votes: { count: 0 } })).toEqual({
      variable_total: { value: 7 },
    });
  });
  it("projects live source fields onto nested scene variable paths", () => {
    expect(
      sceneVariableValues(graph, "scene_vote", {
        source_votes: { count: 7 },
      }),
    ).toEqual({ variable_total: { value: 7 } });
  });
  it("uses the live source value pushed by the editor", () => {
    expect(
      sceneVariableValues(graph, "scene_vote", {
        source_votes: { count: 42 },
      }),
    ).toEqual({ variable_total: { value: 42 } });
  });
  it("does not treat an editor value equal to the type baseline as legacy", () => {
    const graphWithPublishedEdit: ShowGraph = {
      ...graph,
      sourceFieldDefaults: [{ nodeId: "source_votes", fieldPath: ["count"], value: 0 }],
    };
    expect(
      sceneVariableValues(graphWithPublishedEdit, "scene_vote", {
        source_votes: { count: 0 },
      }),
    ).toEqual({ variable_total: { value: 0 } });
  });
  it("remaps structured Source values to destination field ids", () => {
    expect(
      sceneVariableValues(mappedGraph, "scene_profile", {
        source_profile: { source_name: "Alice", source_score: 7 },
      }),
    ).toEqual({
      variable_profile: { target_name: "Alice", target_score: 7 },
    });
  });

  it("propagates values through a Source-to-Source edge", () => {
    expect(
      sceneVariableValues(sourceChainGraph, "scene_chain", {
        source_upstream: "Live",
        source_downstream: "Stale",
      }),
    ).toEqual({ variable_chain: "Live" });
  });

  it("resolves Device pairing and QR virtual values", () => {
    const values = sceneVariableValues(deviceGraph, "scene_device", {});
    expect(values.variable_pairing).toBe("PAIR5");
    expect(values.variable_qr).toMatchObject({
      assetId: "device-qr:device_audience",
      revision: "PAIR5",
    });
  });
});

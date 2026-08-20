import { describe, expect, it } from "vitest";

import type { ShowGraph } from "@mechane/domain";

import { sourceLabelFor } from "./source-label";

const graph: ShowGraph = {
  shapes: [
    {
      id: "shape_1",
      name: "Person",
      fields: [
        { id: "field_name", name: "Name", type: "text", required: false, defaultValue: null },
      ],
    },
  ],
  nodes: [
    {
      id: "device_1",
      kind: "device",
      name: "Audience phones",
      position: { x: 0, y: 0 },
      parentId: null,
      perConnection: true,
      pairingCode: "V9BEZ",
    },
    {
      id: "source_1",
      kind: "source",
      name: "Vote tally",
      position: { x: 0, y: 0 },
      parentId: null,
      type: "number",
    },
    {
      id: "scene_1",
      kind: "scene",
      name: "Results",
      position: { x: 0, y: 0 },
      parentId: null,
      variables: [{ id: "variable_1", name: "winner" }],
    },
  ],
  edges: [],
};

describe("sourceLabelFor", () => {
  it.each([
    ["qr-code", "QR Code"],
    ["pairing-code", "Join code"],
  ])("names Device virtual handle %s", (handle, expected) => {
    expect(sourceLabelFor(graph, "device_1", handle)).toBe(expected);
  });

  it("uses a Scene Variable name", () => {
    expect(sourceLabelFor(graph, "scene_1", "variable_1")).toBe("winner");
  });

  it("uses a Shape field name", () => {
    expect(sourceLabelFor(graph, "source_1", "field_name")).toBe("Name");
  });

  it("uses the producer name for the node output", () => {
    expect(sourceLabelFor(graph, "source_1", "out")).toBe("Vote tally");
  });
});

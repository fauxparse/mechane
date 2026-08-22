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
      fieldDefaults: [{ nodeId: "source_votes", fieldPath: ["count"], value: 7 }],
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
});

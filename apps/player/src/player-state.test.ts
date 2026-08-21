import { describe, expect, it } from "vitest";

import type { ShowGraph } from "@mechane/domain";
import { sceneVariableValues } from "./player-state";

const graph: ShowGraph = {
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
};

describe("sceneVariableValues", () => {
  it("projects live source fields onto nested scene variable paths", () => {
    expect(
      sceneVariableValues(graph, "scene_vote", {
        source_votes: { count: 7 },
      }),
    ).toEqual({ variable_total: { value: 7 } });
  });
});

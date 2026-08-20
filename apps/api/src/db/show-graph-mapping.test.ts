import type { FlowNode } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import { graphNodeInsertValues } from "./graph-node-values";

const FLOW: FlowNode = {
  id: "flow_vote",
  kind: "flow",
  name: "Vote",
  parentId: null,
  position: { x: 0, y: 0 },
  defaultSceneId: null,
  color: "purple",
};

describe("graphNodeInsertValues", () => {
  it("includes a Flow color in the row written for reload", () => {
    expect(graphNodeInsertValues(FLOW, "graph_draft")).toMatchObject({
      graphId: "graph_draft",
      id: "flow_vote",
      color: "purple",
    });
  });
});

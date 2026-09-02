import type { FlowNode, SceneNode } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import { graphNodeInsertValues } from "./graph-node-values";

const FLOW: FlowNode = {
  id: "flow_vote",
  kind: "flow",
  name: "Vote",
  parentId: null,
  position: { x: 0, y: 0 },
  defaultSceneId: null,
  size: { width: 640, height: 480 },
  color: "purple",
};

const SCENE: SceneNode = {
  id: "scene_vote",
  kind: "scene",
  name: "Vote",
  parentId: "flow_vote",
  position: { x: 0, y: 0 },
  color: "aqua",
  variables: [],
};

describe("graphNodeInsertValues", () => {
  it("includes a Flow color and authored size in the row written for reload", () => {
    expect(graphNodeInsertValues(FLOW, "graph_draft")).toMatchObject({
      graphId: "graph_draft",
      id: "flow_vote",
      color: "purple",
      size: { width: 640, height: 480 },
    });
  });

  it("includes a non-Flow node color in the row written for reload", () => {
    expect(graphNodeInsertValues(SCENE, "graph_draft")).toMatchObject({
      graphId: "graph_draft",
      id: "scene_vote",
      color: "aqua",
    });
  });
});

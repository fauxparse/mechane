import { describe, expect, it } from "vitest";

import { deviceReadsChangedSources, sourceIdsReachableFromScenes } from "./invalidation";
import type { ShowGraph } from "./graph";

const graph: ShowGraph = {
  nodes: [
    { id: "scene", kind: "scene", name: "Scene", parentId: "flow", position: { x: 0, y: 0 }, variables: [{ id: "variable", name: "Value", type: "number" }] },
    { id: "transformer", kind: "transformer", name: "Transformer", parentId: null, position: { x: 0, y: 0 }, type: "number" },
    { id: "source", kind: "source", name: "Source", parentId: null, position: { x: 0, y: 0 }, type: "number" },
  ],
  edges: [
    { id: "source-transformer", kind: "wiring", sourceId: "source", targetId: "transformer", sourcePath: [], targetPath: [] },
    { id: "transformer-scene", kind: "wiring", sourceId: "transformer", targetId: "scene", sourcePath: [], targetPath: ["variable"] },
  ],
};

describe("Source read-set reachability", () => {
  it("walks wiring backwards through opaque Transformers", () => {
    expect(sourceIdsReachableFromScenes(graph, ["scene"])).toEqual(new Set(["source"]));
    expect(deviceReadsChangedSources(graph, ["scene"], new Set(["source"]))).toBe(true);
    expect(deviceReadsChangedSources(graph, ["scene"], new Set(["other"]))).toBe(false);
  });
});

// `hidden` owns a boolean column *and* lives in the property JSON, because
// #705 made it a PropertyValue. Reading the column over an authored Formula
// resolved it to `false`, so the next save wrote the loss back (#740).
import type { ShowGraph } from "@mechane/domain/graph";
import { describe, expect, it } from "vitest";

import { readCanvas, writeCanvas } from "./canvas";
import { readShowGraph, writeShowGraph } from "./show-graph";
import { setupPostgresTest } from "./test-helpers";

const { showId, createShow } = setupPostgresTest("canvas-hidden-test");

const graph: ShowGraph = {
  nodes: [
    {
      id: "scene_one",
      kind: "scene",
      name: "Scene one",
      parentId: null,
      position: { x: 0, y: 0 },
      variables: [],
    },
  ],
  edges: [],
};

const hiddenFormula = {
  kind: "formula" as const,
  formula: "item.votes == 0",
  fallback: false,
};

describe("a Formula-valued hidden", () => {
  it("survives the row boundary instead of resolving to a literal", async () => {
    await createShow("Canvas Hidden Test");
    await writeShowGraph(showId, "draft", graph);
    const draft = await readShowGraph(showId, "draft");

    await writeCanvas(
      showId,
      "draft",
      { sceneNodeId: "scene_one" },
      {
        root: {
          id: "root",
          type: "frame",
          rank: "a",
          children: [{ id: "bar", type: "rect", rank: "a", hidden: hiddenFormula }],
        },
      },
      draft.version,
    );

    const read = await readCanvas(showId, "draft", { sceneNodeId: "scene_one" });
    expect(read?.root.children?.[0]?.hidden).toEqual(hiddenFormula);

    // The save that follows a read is where the loss used to land.
    const reread = await readShowGraph(showId, "draft");
    await writeCanvas(showId, "draft", { sceneNodeId: "scene_one" }, read!, reread.version);
    const after = await readCanvas(showId, "draft", { sceneNodeId: "scene_one" });

    expect(after?.root.children?.[0]?.hidden).toEqual(hiddenFormula);
  });
});

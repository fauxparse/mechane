// A Canvas edit and the removal of the Scene that owns it can land in the same
// batch (issues #594 and #773): the author drags something on the Scene's Canvas,
// then deletes the Scene (or its Flow) before the 700ms debounce flushes, and both
// edits go out together. `writeGraph` applies graph edits first, so by the time
// the batched Canvas edit runs, the Scene's row — and its Canvas, via `ON DELETE
// CASCADE` — are already gone. The graph delete must also remove Scene-owned Cues
// before validation; otherwise the whole batch is rejected.
import { CANVAS_COMMAND_TYPES, GRAPH_COMMAND_TYPES } from "@mechane/commands";
import type { CanvasWorkspaceEdit, GraphEdit } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain/graph";
import { describe, expect, it } from "vitest";

import { readCanvasWorkspace } from "./canvas";
import { setupPostgresTest } from "./test-helpers";
import { applyShowEdits, readShowGraph, writeShowGraph } from "./show-graph";

const { showId, createShow } = setupPostgresTest("graph-canvas-delete-order-test");

const graph: ShowGraph = {
  nodes: [
    {
      id: "scene_one",
      kind: "scene",
      name: "One",
      position: { x: 0, y: 0 },
      parentId: null,
      variables: [],
    },
  ],
  edges: [],
  cues: [
    {
      id: "cue_scene_one",
      name: "Scene One Cue",
      owner: { kind: "scene", sceneId: "scene_one" },
      actionIds: [],
    },
  ],
};

describe("a Canvas edit batched with the deletion of its own owner (#594, #773)", () => {
  it("drops the orphaned Canvas edit and Cue instead of failing the whole batch", async () => {
    await createShow("Delete Order Test");
    await writeShowGraph(showId, "draft", graph);

    const sceneCanvas = (await readCanvasWorkspace(showId, "draft")).canvases[0];
    if (!sceneCanvas) throw new Error("The Scene Canvas was not created.");
    const draft = await readShowGraph(showId, "draft");

    const graphEdits: GraphEdit[] = [{ type: GRAPH_COMMAND_TYPES.removeNode, nodeId: "scene_one" }];
    const canvasEdits: CanvasWorkspaceEdit[] = [
      {
        canvasId: sceneCanvas.id,
        edit: {
          type: CANVAS_COMMAND_TYPES.updateElement,
          elementId: sceneCanvas.root.id,
          properties: { fill: "#000000" },
        },
      },
    ];

    const applied = await applyShowEdits(showId, graphEdits, canvasEdits, draft.version);
    expect(applied.version).toBe(draft.version + 1);
    expect(applied.amendments).toEqual([
      { type: "graph.removeCue", cueId: "cue_scene_one" },
    ]);

    const reread = await readShowGraph(showId, "draft");
    expect(reread.nodes).toEqual([]);
    expect((await readCanvasWorkspace(showId, "draft")).canvases).toEqual([]);
    expect(reread.cues).toEqual([]);
  });
});

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
      id: "flow_one",
      kind: "flow",
      name: "One",
      position: { x: 0, y: 0 },
      parentId: null,
      defaultSceneId: "scene_two",
    },
    {
      id: "scene_one",
      kind: "scene",
      name: "One",
      position: { x: 0, y: 0 },
      parentId: "flow_one",
      variables: [],
    },
    {
      id: "scene_two",
      kind: "scene",
      name: "Two",
      position: { x: 100, y: 0 },
      parentId: "flow_one",
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
    {
      id: "cue_scene_two",
      name: "Scene Two Cue",
      owner: { kind: "scene", sceneId: "scene_two" },
      actionIds: ["action_to_scene_one"],
    },
  ],
  actions: [
    {
      id: "action_to_scene_one",
      cueId: "cue_scene_two",
      kind: "navigate",
      targetSceneId: "scene_one",
    },
  ],
};

describe("a Canvas edit batched with the deletion of its own owner (#594, #773)", () => {
  it("drops orphaned interactions and the Canvas edit instead of failing the whole batch", async () => {
    await createShow("Delete Order Test");
    await writeShowGraph(showId, "draft", graph);

    const sceneCanvas = (await readCanvasWorkspace(showId, "draft")).canvases.find(
      (canvas) => canvas.ownerId === "scene_one",
    );
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
      { type: "graph.removeAction", actionId: "action_to_scene_one" },
    ]);

    const reread = await readShowGraph(showId, "draft");
    expect(reread.nodes.map((node) => node.id)).toEqual(["flow_one", "scene_two"]);
    expect((await readCanvasWorkspace(showId, "draft")).canvases).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: sceneCanvas.id })]),
    );
    expect((reread.cues ?? []).map((cue) => cue.id)).toEqual(["cue_scene_two"]);
    expect(reread.actions).toEqual([]);
  });
});

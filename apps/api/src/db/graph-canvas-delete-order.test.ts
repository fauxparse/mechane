// A Canvas edit and the removal of the Scene that owns it can land in the same
// batch (issue #594): the author drags something on the Scene's Canvas, then
// deletes the Scene (or its Flow) before the 700ms debounce flushes, and both
// edits go out together. `writeGraph` applies graph edits first, so by the
// time the batched Canvas edit runs, the Scene's row — and its Canvas, via
// `ON DELETE CASCADE` — are already gone. That edit now targets nothing; it
// must be dropped, not fail the whole batch and roll back a valid deletion.
import { CANVAS_COMMAND_TYPES, GRAPH_COMMAND_TYPES } from "@mechane/commands";
import type { CanvasWorkspaceEdit, GraphEdit } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "./client";
import { readCanvasWorkspace } from "./canvas";
import { shows, user } from "./schema";
import { applyShowEdits, readShowGraph, writeShowGraph } from "./show-graph";

const userId = `graph-canvas-delete-order-test-${crypto.randomUUID()}`;
const showId = `graph-canvas-delete-order-show-${crypto.randomUUID()}`;

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
};

describe("a Canvas edit batched with the deletion of its own owner (#594)", () => {
  afterEach(async () => {
    await db.delete(user).where(eq(user.id, userId));
  });

  it("drops the orphaned Canvas edit instead of failing the whole batch", async () => {
    await db.insert(user).values({
      id: userId,
      name: "Delete Order Test",
      email: `${userId}@example.com`,
      emailVerified: true,
    });
    await db.insert(shows).values({ id: showId, name: "Delete Order Test", userId });
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

    const reread = await readShowGraph(showId, "draft");
    expect(reread.nodes).toEqual([]);
    expect((await readCanvasWorkspace(showId, "draft")).canvases).toEqual([]);
  });
});

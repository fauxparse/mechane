// One batch creates a Block and edits the Canvas it came out of (#426): the Block Canvas is
// created from the `graph.addBlock` edit, at the position the client chose, and a Canvas edit in
// the same batch can already target it.
import { CANVAS_COMMAND_TYPES, GRAPH_COMMAND_TYPES } from "@mechane/commands";
import type { CanvasWorkspaceEdit, GraphEdit } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "./client";
import { readCanvasWorkspace } from "./canvas";
import { shows, user } from "./schema";
import { applyShowEdits, readShowGraph, writeShowGraph } from "./show-graph";

const userId = `block-creation-test-${crypto.randomUUID()}`;
const showId = `block-creation-show-${crypto.randomUUID()}`;

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

const addBlock: GraphEdit = {
  type: GRAPH_COMMAND_TYPES.addBlock,
  block: {
    id: "block_card",
    name: "Card",
    canvas: {
      id: "canvas_card",
      kind: "block",
      position: { x: 2000, y: 40 },
      root: {
        id: "canvas_card-root",
        type: "frame",
        children: [{ id: "card_title", type: "text", rank: "a", content: "Title" }],
      },
    },
    variables: [],
    states: [],
    stateSelectorVariableId: null,
  },
};

describe("creating a Block from the Canvas editor", () => {
  afterEach(async () => {
    await db.delete(user).where(eq(user.id, userId));
  });

  it("places the new Block Canvas where the client asked, and accepts edits to it in the same batch", async () => {
    await db.insert(user).values({
      id: userId,
      name: "Block Creation Test",
      email: `${userId}@example.com`,
      emailVerified: true,
    });
    await db.insert(shows).values({ id: showId, name: "Block Creation Test", userId });
    await writeShowGraph(showId, "draft", graph);

    const sceneCanvas = (await readCanvasWorkspace(showId, "draft")).canvases[0];
    if (!sceneCanvas) throw new Error("The Scene Canvas was not created.");
    const draft = await readShowGraph(showId, "draft");

    const canvasEdits: CanvasWorkspaceEdit[] = [
      // The Slot that replaces the selection on the Scene…
      {
        canvasId: sceneCanvas.id,
        edit: {
          type: CANVAS_COMMAND_TYPES.addElement,
          element: { id: "slot_card", type: "slot", blockId: "block_card" },
          parentId: sceneCanvas.root.id,
          rank: "b",
        },
      },
      // …and an edit to the Block Canvas this same batch creates.
      {
        canvasId: "canvas_card",
        edit: {
          type: CANVAS_COMMAND_TYPES.updateElement,
          elementId: "card_title",
          properties: { content: "Renamed" },
        },
      },
    ];

    await applyShowEdits(showId, [addBlock], canvasEdits, draft.version);

    const canvases = (await readCanvasWorkspace(showId, "draft")).canvases;
    const blockCanvas = canvases.find((canvas) => canvas.ownerId === "block_card");
    expect(blockCanvas?.id).toBe("canvas_card");
    expect(blockCanvas?.position).toEqual({ x: 2000, y: 40 });
    expect(blockCanvas?.root.children?.[0]).toMatchObject({
      id: "card_title",
      content: "Renamed",
    });

    const scene = canvases.find((canvas) => canvas.ownerId === "scene_one");
    expect(scene?.root.children?.map((child) => child.id)).toContain("slot_card");
  });
});

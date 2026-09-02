import { emptyBlock } from "@mechane/domain";
import type { ShowGraph } from "@mechane/domain";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "./client";
import { GraphVersionConflictError, persistGraphRows, readGraphRows } from "./graph-persistence";
import { canvasElements, canvases, devices, shows, user } from "./schema";

const userId = `graph-persistence-test-${crypto.randomUUID()}`;
const block = { ...emptyBlock("Card"), id: "block_card" };
const showId = `graph-persistence-show-${crypto.randomUUID()}`;
const graph: ShowGraph = {
  shapes: [],
  nodes: [
    {
      id: "source_copy",
      kind: "source",
      name: "Copy",
      position: { x: 0, y: 0 },
      parentId: null,
      type: "number",
    },
    {
      id: "source_score",
      kind: "source",
      name: "Score",
      position: { x: 0, y: 0 },
      parentId: null,
      type: "number",
    },
  ],
  edges: [
    {
      id: "edge_score",
      kind: "wiring",
      sourceId: "source_score",
      targetId: "source_copy",
      sourcePath: [],
      targetPath: [],
      // Where the author dragged this edge's runs, keyed by route shape (#475).
      layout: { HVH: { "1": -24 } },
    },
  ],
};

async function createShow(): Promise<void> {
  await db.insert(user).values({
    id: userId,
    name: "Graph Persistence Test",
    email: `${userId}@example.com`,
    emailVerified: true,
  });
  await db.insert(shows).values({ id: showId, name: "Graph Persistence", userId });
}

afterEach(async () => {
  await db.delete(user).where(eq(user.id, userId));
});

describe("graph row persistence", () => {
  it("writes and reads graph rows without lifecycle side effects", async () => {
    await createShow();

    const written = await db.transaction((tx) => persistGraphRows(tx, showId, "draft", graph));
    const reread = await readGraphRows(showId, "draft");

    expect(written.graph.version).toBe(1);
    expect(reread).toMatchObject({ showId, state: "draft", version: 1 });
    expect(reread.nodes).toEqual(graph.nodes);
    expect(reread.edges).toEqual(graph.edges);
    expect(await db.select().from(devices).where(eq(devices.showId, showId))).toEqual([]);
  });

  it("keeps an edge's authored layout across a write and a reread", async () => {
    await createShow();

    await db.transaction((tx) => persistGraphRows(tx, showId, "draft", graph));
    const reread = await readGraphRows(showId, "draft");

    expect(reread.edges[0]).toMatchObject({
      id: "edge_score",
      layout: { HVH: { "1": -24 } },
    });
  });

  it("leaves an edge that was never dragged with no layout at all", async () => {
    await createShow();

    const plain = {
      ...graph,
      edges: graph.edges.map(({ layout: _layout, ...edge }) => edge),
    };
    await db.transaction((tx) => persistGraphRows(tx, showId, "draft", plain));
    const reread = await readGraphRows(showId, "draft");

    expect(reread.edges[0]).not.toHaveProperty("layout");
  });

  it("rejects a stale version without changing stored graph rows", async () => {
    await createShow();
    await db.transaction((tx) => persistGraphRows(tx, showId, "draft", graph));

    await expect(
      db.transaction((tx) => persistGraphRows(tx, showId, "draft", graph, 0)),
    ).rejects.toBeInstanceOf(GraphVersionConflictError);

    const reread = await readGraphRows(showId, "draft");
    expect(reread.version).toBe(1);
    expect(reread.edges).toEqual(graph.edges);
  });

  it("persists an empty Cue as a valid no-op", async () => {
    await createShow();
    const interactionGraph: ShowGraph = {
      ...graph,
      blocks: [block],
      nodes: [
        ...graph.nodes,
        {
          id: "flow_interaction",
          kind: "flow",
          name: "Interaction Flow",
          position: { x: 0, y: 0 },
          parentId: null,
          defaultSceneId: "scene_interaction",
        },
        {
          id: "scene_interaction",
          kind: "scene",
          name: "Interaction Scene",
          position: { x: 0, y: 0 },
          parentId: "flow_interaction",
          variables: [],
        },
      ],
      cues: [
        {
          id: "cue_empty",
          name: "No-op",
          owner: { kind: "scene", sceneId: "scene_interaction" },
          actionIds: [],
        },
        {
          id: "cue_block",
          name: "Block Cue",
          owner: { kind: "block", blockId: block.id },
          actionIds: [],
        },
      ],
      actions: [],
      eventBindings: [],
    };
    await db.transaction(async (tx) => {
      const written = await persistGraphRows(tx, showId, "draft", interactionGraph);
      await tx.insert(canvases).values({
        id: "canvas_interaction",
        graphId: written.graphId,
        sceneNodeId: "scene_interaction",
        positionX: 0,
        positionY: 0,
      });
      await tx.insert(canvasElements).values({
        id: "root_interaction",
        canvasId: "canvas_interaction",
        type: "frame",
        rank: "a",
        name: "Root",
      });
      await tx.insert(canvases).values({
        id: "canvas_block",
        graphId: written.graphId,
        blockId: block.id,
        positionX: 0,
        positionY: 0,
      });
      await tx.insert(canvasElements).values({
        id: "root_block",
        canvasId: "canvas_block",
        type: "frame",
        rank: "a",
        name: "Root",
      });
    });
    const reread = await readGraphRows(showId, "draft");
    expect(reread.cues).toHaveLength(2);
    expect(reread.cues).toEqual(expect.arrayContaining([...(interactionGraph.cues ?? [])]));
    expect(reread.actions).toEqual([]);
    expect(reread.edges.filter((edge) => edge.kind === "navigate")).toEqual([]);
  });

  it("maps supplied Device identity without reading or writing the devices table", async () => {
    await createShow();
    const deviceGraph: ShowGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: "device_projector",
          kind: "device",
          name: "Projector",
          position: { x: 0, y: 0 },
          parentId: null,
          perConnection: true,
          pairingCode: null,
        },
      ],
      edges: [],
    };

    await db.transaction((tx) => persistGraphRows(tx, showId, "draft", deviceGraph));
    const reread = await readGraphRows(
      showId,
      "draft",
      new Map([["device_projector", { pairingCode: "AB123", perConnection: true }]]),
    );

    expect(reread.nodes.find((node) => node.kind === "device")).toMatchObject({
      id: "device_projector",
      pairingCode: "AB123",
      perConnection: true,
    });
    expect(await db.select().from(devices).where(eq(devices.showId, showId))).toEqual([]);
  });
});

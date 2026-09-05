import { emptyBlock } from "@mechane/domain";
import type { ShowGraph } from "@mechane/domain";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "./client";
import {
  GraphVersionConflictError,
  persistEventBindings,
  persistGraphRows,
  readGraphRows,
} from "./graph-persistence";
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
      // What the author dragged on this edge, keyed by route shape then by
      // handle: a run dragged across itself, and a jog cut into an end run
      // (#475). The jog keys are here because they are the ones a layer
      // between the editor and this column can misread as a run index.
      layout: { HVH: { "1": -24, "0.head": 36, "2.tail": -18 } },
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
  it("persists a wiring edge's conversion, so a published graph carries it (#532)", async () => {
    await createShow();
    const convertingGraph: ShowGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: "source_scores",
          kind: "source",
          name: "Scores",
          position: { x: 0, y: 0 },
          parentId: null,
          type: { kind: "array", of: "number" },
        },
      ],
      edges: [
        {
          id: "edge_first_score",
          kind: "wiring",
          sourceId: "source_scores",
          targetId: "source_copy",
          sourcePath: [],
          targetPath: [],
          conversion: "firstItem",
        },
      ],
    };

    await db.transaction((tx) => persistGraphRows(tx, showId, "draft", convertingGraph));
    // Publishing writes the draft's own edges into the published state, which
    // is where a Run then reads them from.
    const draft = await readGraphRows(showId, "draft");
    expect(draft.edges).toEqual(convertingGraph.edges);

    await db.transaction((tx) => persistGraphRows(tx, showId, "published", draft));
    expect((await readGraphRows(showId, "published")).edges).toEqual(convertingGraph.edges);
  });

  it("persists and reads an authored Flow size", async () => {
    await createShow();
    const sizedGraph: ShowGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: "flow_sized",
          kind: "flow",
          name: "Sized Flow",
          position: { x: 0, y: 0 },
          parentId: null,
          defaultSceneId: null,
          size: { width: 640, height: 480 },
        },
      ],
    };

    await db.transaction((tx) => persistGraphRows(tx, showId, "draft", sizedGraph));
    const reread = await readGraphRows(showId, "draft");

    expect(reread.nodes.find((node) => node.id === "flow_sized")).toMatchObject({
      kind: "flow",
      size: { width: 640, height: 480 },
    });
  });
  it("persists and reads Event Binding priority order", async () => {
    await createShow();
    const interactionGraph: ShowGraph = {
      shapes: [],
      nodes: [
        {
          id: "flow_ordered",
          kind: "flow",
          name: "Ordered Flow",
          position: { x: 0, y: 0 },
          parentId: null,
          defaultSceneId: "scene_ordered",
        },
        {
          id: "scene_ordered",
          kind: "scene",
          name: "Ordered Scene",
          position: { x: 0, y: 0 },
          parentId: "flow_ordered",
          variables: [],
        },
      ],
      edges: [],
      cues: [
        {
          id: "cue_first",
          name: "First",
          owner: { kind: "scene", sceneId: "scene_ordered" },
          actionIds: [],
        },
        {
          id: "cue_second",
          name: "Second",
          owner: { kind: "scene", sceneId: "scene_ordered" },
          actionIds: [],
        },
      ],
      actions: [],
      eventBindings: [],
    };
    await db.transaction(async (tx) => {
      const written = await persistGraphRows(tx, showId, "draft", interactionGraph);
      await tx.insert(canvases).values({
        id: "canvas_ordered",
        graphId: written.graphId,
        sceneNodeId: "scene_ordered",
        positionX: 0,
        positionY: 0,
      });
      await tx.insert(canvasElements).values([
        {
          id: "root_ordered",
          canvasId: "canvas_ordered",
          type: "frame",
          rank: "a",
          name: "Root",
        },
        {
          id: "button_ordered",
          canvasId: "canvas_ordered",
          parentId: "root_ordered",
          type: "rect",
          rank: "a",
          name: "Button",
        },
      ]);
    });
    const first = {
      id: "binding_first",
      canvasId: "canvas_ordered",
      elementId: "button_ordered",
      eventKind: "tap" as const,
      cueId: "cue_first",
      position: 0,
    };
    const second = {
      ...first,
      id: "binding_second",
      cueId: "cue_second",
      position: 1,
    };
    await db.transaction(async (tx) => {
      const written = await persistGraphRows(tx, showId, "draft", {
        ...interactionGraph,
        eventBindings: [second, first],
      });
      await persistEventBindings(tx, written.graphId, [second, first]);
    });

    const reread = await readGraphRows(showId, "draft");
    expect(reread.eventBindings).toEqual([first, second]);
  });

  it("keeps an edge's authored layout across a write and a reread", async () => {
    await createShow();

    await db.transaction((tx) => persistGraphRows(tx, showId, "draft", graph));
    const reread = await readGraphRows(showId, "draft");

    expect(reread.edges[0]).toMatchObject({
      id: "edge_score",
      layout: { HVH: { "1": -24, "0.head": 36, "2.tail": -18 } },
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

  // The case the seeded navigation demo exposed: this edge is not stored at
  // all, it is rebuilt from its Action on the way in — so the drag has to be
  // on the Action or the write throws it away.
  it("keeps a drag on a navigate edge projected from an Action", async () => {
    await createShow();
    const layout = { HVH: { "0": -119, "0.head": 24 } };
    const navigating: ShowGraph = {
      shapes: [],
      nodes: [
        {
          id: "flow_show",
          kind: "flow",
          name: "Show",
          position: { x: 0, y: 0 },
          parentId: null,
          defaultSceneId: "scene_red",
        },
        {
          id: "scene_red",
          kind: "scene",
          name: "Red",
          position: { x: 0, y: 0 },
          parentId: "flow_show",
          variables: [],
        },
        {
          id: "scene_blue",
          kind: "scene",
          name: "Blue",
          position: { x: 400, y: 0 },
          parentId: "flow_show",
          variables: [],
        },
      ],
      edges: [],
      cues: [
        {
          id: "cue_go",
          name: "Go",
          owner: { kind: "scene", sceneId: "scene_red" },
          actionIds: ["action_go"],
        },
      ],
      actions: [
        { id: "action_go", cueId: "cue_go", kind: "navigate", targetSceneId: "scene_blue", layout },
      ],
      eventBindings: [],
    };

    await db.transaction(async (tx) => {
      const written = await persistGraphRows(tx, showId, "draft", navigating);
      // Every Scene needs a Canvas, checked when the transaction commits.
      for (const sceneNodeId of ["scene_red", "scene_blue"]) {
        await tx
          .insert(canvases)
          .values({ id: `canvas_${sceneNodeId}`, graphId: written.graphId, sceneNodeId });
        await tx.insert(canvasElements).values({
          id: `root_${sceneNodeId}`,
          canvasId: `canvas_${sceneNodeId}`,
          type: "frame",
          rank: "a",
          name: "Root",
        });
      }
    });
    const reread = await readGraphRows(showId, "draft");

    expect(reread.actions?.[0]).toMatchObject({ id: "action_go", layout });
    // And projected back onto the edge, which is what the editor reads.
    expect(reread.edges.find((edge) => edge.id === "navigate:action_go")).toMatchObject({ layout });
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
    expect(reread.cues).toEqual(
      expect.arrayContaining(
        (interactionGraph.cues ?? []).map((cue) => ({ ...cue, parameters: [] })),
      ),
    );
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

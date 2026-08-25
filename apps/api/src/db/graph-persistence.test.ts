import type { ShowGraph } from "@mechane/domain";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "./client";
import { GraphVersionConflictError, persistGraphRows, readGraphRows } from "./graph-persistence";
import { devices, shows, user } from "./schema";

const userId = `graph-persistence-test-${crypto.randomUUID()}`;
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

import { BlockCycleError, emptyBlock } from "@mechane/domain";
import type { GraphEdit } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain";
import { and, eq, isNull } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "./client";
import { readActiveRun, startRun } from "./runs";
import { applyShowEdits, publishShowGraph, readShowGraph, writeShowGraph } from "./show-graph";
import { devices, shows, user } from "./schema";

const userId = `show-lifecycle-test-${crypto.randomUUID()}`;
const showId = `show-lifecycle-${crypto.randomUUID()}`;

const graph: ShowGraph = {
  nodes: [
    {
      id: "source_score",
      kind: "source",
      name: "Score",
      position: { x: 0, y: 0 },
      parentId: null,
      type: "number",
    },
    {
      id: "device_projector",
      kind: "device",
      name: "Projector",
      position: { x: 0, y: 0 },
      parentId: null,
      perConnection: false,
      pairingCode: null,
    },
  ],
  edges: [],
  sourceFieldDefaults: [{ nodeId: "source_score", fieldPath: [], value: 1 }],
};

async function createShow(): Promise<void> {
  await db.insert(user).values({
    id: userId,
    name: "Show Lifecycle Test",
    email: `${userId}@example.com`,
    emailVerified: true,
  });
  await db.insert(shows).values({ id: showId, name: "Show Lifecycle", userId });
}

afterEach(async () => {
  await db.delete(user).where(eq(user.id, userId));
});

describe("Show graph lifecycle", () => {
  it("publishes structure, preserves Device identity, and updates the active Run", async () => {
    await createShow();
    await writeShowGraph(showId, "draft", graph);

    const draftBeforePublish = await readShowGraph(showId, "draft");
    const draftDevice = draftBeforePublish.nodes.find((node) => node.kind === "device");
    if (draftDevice?.kind !== "device" || !draftDevice.pairingCode) {
      throw new Error("Draft Device identity was not minted.");
    }

    const published = await publishShowGraph(showId);
    expect(published.nodes).toEqual(expect.arrayContaining([draftDevice]));
    expect(published.version).toBe(1);
    expect((await readShowGraph(showId, "draft")).version).toBe(draftBeforePublish.version);
    expect(
      await db
        .select()
        .from(devices)
        .where(and(eq(devices.showId, showId), isNull(devices.retiredAt))),
    ).toHaveLength(1);

    const run = await startRun(showId);
    expect(run.sourceValues).toEqual({ source_score: 0 });

    const edit: GraphEdit = {
      type: "graph.setSourceFieldDefault",
      nodeId: "source_score",
      fieldPath: [],
      value: 2,
    };
    const applied = await applyShowEdits(showId, [edit], [], draftBeforePublish.version);
    expect(applied.version).toBe(draftBeforePublish.version + 1);
    expect((await readActiveRun(showId))?.sourceValues).toEqual({ source_score: 2 });
    expect((await readShowGraph(showId, "published")).version).toBe(2);
  });

  it("persists and publishes Block State metadata", async () => {
    await createShow();
    const empty = emptyBlock("Card");
    const baseBlock = {
      ...empty,
      canvas: {
        ...empty.canvas,
        root: { ...empty.canvas.root, layoutMode: "auto" as const },
      },
    };
    const block = {
      ...baseBlock,
      states: [
        {
          id: "default",
          name: "Default",
          isDefault: true,
          overrides: [],
        },
        {
          id: "live",
          name: "Live",
          isDefault: false,
          overrides: [
            { elementId: baseBlock.canvas.root.id, property: "layoutMode", value: "auto" },
          ],
        },
      ],
    };
    await writeShowGraph(showId, "draft", { ...graph, blocks: [block] });

    const draft = await readShowGraph(showId, "draft");
    expect(draft.blocks?.[0]?.states).toEqual(block.states);

    const published = await publishShowGraph(showId);
    expect(published.blocks?.[0]?.states).toEqual(block.states);
    expect((await readShowGraph(showId, "draft")).blocks?.[0]?.states).toEqual(block.states);
  });

  it("rejects cyclic Blocks at the persistence boundary", async () => {
    await createShow();
    const first = emptyBlock("First");
    const second = emptyBlock("Second");
    const firstWithSlot = {
      ...first,
      canvas: {
        ...first.canvas,
        root: {
          ...first.canvas.root,
          children: [{ id: "first-slot", type: "slot" as const, blockId: second.id }],
        },
      },
    };
    const secondWithSlot = {
      ...second,
      canvas: {
        ...second.canvas,
        root: {
          ...second.canvas.root,
          children: [{ id: "second-slot", type: "slot" as const, blockId: first.id }],
        },
      },
    };

    await expect(
      writeShowGraph(showId, "draft", {
        ...graph,
        blocks: [firstWithSlot, secondWithSlot],
      }),
    ).rejects.toThrow(BlockCycleError);
  });
});

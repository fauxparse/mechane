import { randomUUID } from "node:crypto";

import type { RealtimeChannel, RealtimeMessage, RealtimeProvider } from "@mechane/realtime";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "./client";
import { drainPlayerInvalidations, enqueuePlayerInvalidations } from "./player-invalidation-outbox";
import { playerInvalidationOutbox, shows, user } from "./schema";
import { seedShow } from "./seeds/shows/navigation-proof/navigation-proof";

const userId = `outbox-test-${randomUUID()}`;
const showId = `outbox-show-${randomUUID()}`;

async function createShow(): Promise<void> {
  await db.insert(user).values({
    id: userId,
    name: "Outbox Test",
    email: `${userId}@example.com`,
    emailVerified: true,
  });
  await db.insert(shows).values({ id: showId, name: "Outbox Test", userId });
  await seedShow.seed(showId);
  await db.delete(playerInvalidationOutbox).where(eq(playerInvalidationOutbox.showId, showId));
}

function providerFor(
  publish: (channel: string, type: string, payload: unknown) => Promise<void>,
): RealtimeProvider {
  return {
    channel(name: string): RealtimeChannel {
      return {
        publish: async (type, payload) => {
          await publish(name, type, payload);
          const message: RealtimeMessage<typeof payload> = {
            id: randomUUID(),
            sequence: 1,
            type,
            payload,
            publishedAt: new Date().toISOString(),
          };
          return message;
        },
        subscribe: () => ({ close: () => undefined }),
      };
    },
  };
}

async function outboxRows() {
  return db
    .select()
    .from(playerInvalidationOutbox)
    .where(eq(playerInvalidationOutbox.showId, showId));
}

beforeEach(async () => {
  await db.delete(playerInvalidationOutbox).where(eq(playerInvalidationOutbox.showId, showId));
  await db.delete(user).where(eq(user.id, userId));
});

afterEach(async () => {
  await db.delete(user).where(eq(user.id, userId));
});

describe.sequential("player invalidation outbox", () => {
  it("rolls back insertion with the state transaction and coalesces pending work", async () => {
    await createShow();

    await expect(
      db.transaction(async (tx) => {
        await enqueuePlayerInvalidations(tx, showId);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await outboxRows()).toHaveLength(0);

    await db.transaction((tx) => enqueuePlayerInvalidations(tx, showId));
    expect(await db.transaction((tx) => enqueuePlayerInvalidations(tx, showId))).toBe(0);
    expect(await outboxRows()).toHaveLength(2);
  });

  it("keeps a new row behind an actively leased row", async () => {
    await createShow();
    await db.transaction((tx) => enqueuePlayerInvalidations(tx, showId));
    const [row] = await outboxRows();
    if (!row) throw new Error("Outbox row was not inserted.");
    await db
      .update(playerInvalidationOutbox)
      .set({
        status: "leased",
        leaseOwner: "worker-a",
        leaseExpiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(playerInvalidationOutbox.id, row.id));

    expect(await db.transaction((tx) => enqueuePlayerInvalidations(tx, showId))).toBe(1);
    expect(await outboxRows()).toHaveLength(3);
  });

  it("delivers one FIFO row per Device and acknowledges after provider acceptance", async () => {
    await createShow();
    await db.transaction((tx) => enqueuePlayerInvalidations(tx, showId));
    const [first] = await outboxRows();
    if (!first) throw new Error("Outbox row was not inserted.");
    await db.insert(playerInvalidationOutbox).values({
      id: randomUUID(),
      showId,
      deviceId: first.deviceId,
      status: "pending",
      createdAt: new Date(Date.now() + 1),
      nextAttemptAt: new Date(),
    });
    const messages: Array<{ channel: string; type: string; payload: unknown }> = [];
    const provider = providerFor(async (channel, type, payload) => {
      messages.push({ channel, type, payload });
    });

    expect(await drainPlayerInvalidations({ batchSize: 10, provider })).toMatchObject({
      claimed: 2,
      delivered: 2,
      failed: 0,
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ type: "player.updated", payload: null });
    expect((await outboxRows()).filter((row) => row.status === "delivered")).toHaveLength(2);

    const pendingBeforeSecondDrain = await outboxRows();
    const secondDrainCount = pendingBeforeSecondDrain.filter(
      (row) => row.status === "pending",
    ).length;
    expect(await drainPlayerInvalidations({ batchSize: 10, provider })).toMatchObject({
      claimed: secondDrainCount,
      delivered: secondDrainCount,
      failed: 0,
    });
    expect(messages).toHaveLength(2 + secondDrainCount);
  });

  it("reschedules provider failures and reclaims expired leases", async () => {
    await createShow();
    await db.transaction((tx) => enqueuePlayerInvalidations(tx, showId));
    const failing = providerFor(async () => {
      throw new Error("provider unavailable");
    });
    expect(await drainPlayerInvalidations({ provider: failing })).toMatchObject({
      claimed: 2,
      delivered: 0,
      failed: 2,
    });
    const [failed] = await outboxRows();
    if (!failed) throw new Error("Failed outbox row was not persisted.");
    expect(failed).toMatchObject({ status: "pending", attemptCount: 1, leaseOwner: null });

    await db
      .update(playerInvalidationOutbox)
      .set({ nextAttemptAt: new Date(Date.now() - 1) })
      .where(eq(playerInvalidationOutbox.id, failed.id));
    const successful = providerFor(async () => undefined);
    expect(await drainPlayerInvalidations({ provider: successful })).toMatchObject({
      claimed: 1,
      delivered: 1,
      failed: 0,
    });

    await db.transaction((tx) => enqueuePlayerInvalidations(tx, showId));
    const [leased] = (await outboxRows()).filter((row) => row.status === "pending");
    if (!leased) throw new Error("Second outbox row was not inserted.");
    await db
      .update(playerInvalidationOutbox)
      .set({
        status: "leased",
        leaseOwner: "dead-worker",
        leaseExpiresAt: new Date(Date.now() - 1),
      })
      .where(eq(playerInvalidationOutbox.id, leased.id));
    expect(await drainPlayerInvalidations({ provider: successful })).toMatchObject({
      claimed: 2,
      delivered: 2,
      failed: 0,
    });
  });
});

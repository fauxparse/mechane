import { randomUUID } from "node:crypto";

import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { RealtimeProvider } from "@mechane/realtime";
import { playerChannel } from "@mechane/realtime";

import { realtimeProvider } from "../realtime";
import { db } from "./client";
import { devices, playerInvalidationOutbox, shows } from "./schema";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_LEASE_MS = 30_000;
const DELIVERY_RETENTION_MS = 24 * 60 * 60 * 1_000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1_000;

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type OutboxRow = typeof playerInvalidationOutbox.$inferSelect;

export interface OutboxDrainOptions {
  batchSize?: number;
  leaseMs?: number;
  workerId?: string;
  now?: Date;
  showId?: string;
  deviceId?: string;
  provider?: RealtimeProvider;
}

export interface OutboxDrainResult {
  claimed: number;
  delivered: number;
  failed: number;
}

function retryDelayMs(attemptCount: number): number {
  return Math.min(2 ** Math.min(attemptCount, 16) * 1_000, MAX_RETRY_DELAY_MS);
}

function hasActiveLease(row: OutboxRow, now: Date): boolean {
  return row.leaseOwner !== null && row.leaseExpiresAt !== null && row.leaseExpiresAt > now;
}

/** Enqueues one invalidation per active Device, coalescing unleased work. */
export async function enqueuePlayerInvalidations(
  tx: Tx,
  showId: string,
  deviceIds?: readonly string[],
): Promise<number> {
  const [show] = await tx
    .update(shows)
    .set({ stateSequence: sql`${shows.stateSequence} + 1`, updatedAt: new Date() })
    .where(eq(shows.id, showId))
    .returning({ stateSequence: shows.stateSequence });
  if (!show) return 0;
  const ids =
    deviceIds ??
    (
      await tx
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.showId, showId), isNull(devices.retiredAt)))
    ).map(({ id }) => id);
  const now = new Date();
  let inserted = 0;

  for (const deviceId of ids) {
    const [pending] = await tx
      .select()
      .from(playerInvalidationOutbox)
      .where(
        and(
          eq(playerInvalidationOutbox.showId, showId),
          eq(playerInvalidationOutbox.deviceId, deviceId),
          eq(playerInvalidationOutbox.status, "pending"),
          or(
            isNull(playerInvalidationOutbox.leaseOwner),
            lt(playerInvalidationOutbox.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(asc(playerInvalidationOutbox.createdAt), asc(playerInvalidationOutbox.id))
      .limit(1)
      .for("update");
    if (pending) {
      await tx
        .update(playerInvalidationOutbox)
        .set({
          stateSequence: sql`greatest(${playerInvalidationOutbox.stateSequence}, ${show.stateSequence})`,
        })
        .where(eq(playerInvalidationOutbox.id, pending.id));
      continue;
    }

    await tx.insert(playerInvalidationOutbox).values({
      id: randomUUID(),
      showId,
      deviceId,
      status: "pending",
      nextAttemptAt: now,
      stateSequence: show.stateSequence,
    });
    inserted += 1;
  }
  return inserted;
}

export async function enqueuePlayerInvalidation(
  tx: Tx,
  showId: string,
  deviceId: string,
): Promise<boolean> {
  return (await enqueuePlayerInvalidations(tx, showId, [deviceId])) > 0;
}

async function claimBatch(
  options: Required<Pick<OutboxDrainOptions, "batchSize" | "leaseMs" | "workerId" | "now">> &
    Pick<OutboxDrainOptions, "showId" | "deviceId">,
): Promise<OutboxRow[]> {
  return db.transaction(async (tx) => {
    const status = or(
      eq(playerInvalidationOutbox.status, "pending"),
      eq(playerInvalidationOutbox.status, "leased"),
    );
    const scope = options.showId
      ? options.deviceId
        ? and(
            eq(playerInvalidationOutbox.showId, options.showId),
            eq(playerInvalidationOutbox.deviceId, options.deviceId),
            status,
          )
        : and(eq(playerInvalidationOutbox.showId, options.showId), status)
      : options.deviceId
        ? and(eq(playerInvalidationOutbox.deviceId, options.deviceId), status)
        : status;
    const deviceRows = await tx
      .selectDistinct({
        showId: playerInvalidationOutbox.showId,
        deviceId: playerInvalidationOutbox.deviceId,
      })
      .from(playerInvalidationOutbox)
      .where(scope);
    const claimed: OutboxRow[] = [];
    const leaseExpiresAt = new Date(options.now.getTime() + options.leaseMs);

    for (const { showId, deviceId } of deviceRows) {
      if (claimed.length >= options.batchSize) break;
      const [row] = await tx
        .select()
        .from(playerInvalidationOutbox)
        .where(
          and(
            eq(playerInvalidationOutbox.showId, showId),
            eq(playerInvalidationOutbox.deviceId, deviceId),
            or(
              eq(playerInvalidationOutbox.status, "pending"),
              eq(playerInvalidationOutbox.status, "leased"),
            ),
          ),
        )
        .orderBy(asc(playerInvalidationOutbox.createdAt), asc(playerInvalidationOutbox.id))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!row || hasActiveLease(row, options.now)) continue;
      if (row.status === "pending" && row.nextAttemptAt > options.now) continue;

      const [leased] = await tx
        .update(playerInvalidationOutbox)
        .set({
          status: "leased",
          leaseOwner: options.workerId,
          leaseExpiresAt,
        })
        .where(eq(playerInvalidationOutbox.id, row.id))
        .returning();
      if (leased) claimed.push(leased);
    }
    return claimed;
  });
}

async function acknowledge(row: OutboxRow, workerId: string, now: Date): Promise<boolean> {
  const result = await db
    .update(playerInvalidationOutbox)
    .set({
      status: "delivered",
      leaseOwner: null,
      leaseExpiresAt: null,
      deliveredAt: now,
      lastError: null,
    })
    .where(
      and(
        eq(playerInvalidationOutbox.id, row.id),
        eq(playerInvalidationOutbox.status, "leased"),
        eq(playerInvalidationOutbox.leaseOwner, workerId),
      ),
    );
  return result.rowCount === 1;
}

async function reschedule(
  row: OutboxRow,
  workerId: string,
  now: Date,
  error: unknown,
): Promise<boolean> {
  const attemptCount = row.attemptCount + 1;
  const message = error instanceof Error ? error.message : "Realtime provider failed.";
  const result = await db
    .update(playerInvalidationOutbox)
    .set({
      status: "pending",
      attemptCount,
      nextAttemptAt: new Date(now.getTime() + retryDelayMs(attemptCount)),
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: message.slice(0, 2_000),
    })
    .where(
      and(
        eq(playerInvalidationOutbox.id, row.id),
        eq(playerInvalidationOutbox.status, "leased"),
        eq(playerInvalidationOutbox.leaseOwner, workerId),
      ),
    );
  return result.rowCount === 1;
}

async function cleanupDelivered(now: Date): Promise<void> {
  await db
    .delete(playerInvalidationOutbox)
    .where(
      and(
        eq(playerInvalidationOutbox.status, "delivered"),
        lt(playerInvalidationOutbox.deliveredAt, new Date(now.getTime() - DELIVERY_RETENTION_MS)),
      ),
    );
}

/** Claims and delivers a bounded batch with at-least-once semantics. */
export async function drainPlayerInvalidations(
  options: OutboxDrainOptions = {},
): Promise<OutboxDrainResult> {
  const resolved: Required<Pick<OutboxDrainOptions, "batchSize" | "leaseMs" | "workerId" | "now">> &
    Pick<OutboxDrainOptions, "showId" | "deviceId"> = {
    batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
    leaseMs: options.leaseMs ?? DEFAULT_LEASE_MS,
    workerId: options.workerId ?? randomUUID(),
    now: options.now ?? new Date(),
    showId: options.showId,
    deviceId: options.deviceId,
  };
  const provider = options.provider ?? realtimeProvider;
  const rows = await claimBatch(resolved);
  let delivered = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await provider
        .channel(playerChannel(row.deviceId))
        .publish("player.updated", { stateSequence: row.stateSequence });
      if (await acknowledge(row, resolved.workerId, new Date())) delivered += 1;
    } catch (error) {
      if (await reschedule(row, resolved.workerId, new Date(), error)) failed += 1;
    }
  }
  await cleanupDelivered(new Date());
  return { claimed: rows.length, delivered, failed };
}

export interface OutboxWorker {
  stop(): void;
}

/** Starts the local persistent drain; overlapping ticks are prevented. */
export function startPlayerInvalidationWorker(
  intervalMs = 250,
  provider: RealtimeProvider = realtimeProvider,
): OutboxWorker {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await drainPlayerInvalidations({ provider });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  void tick();
  return { stop: () => clearInterval(timer) };
}

import type { IncomingMessage, ServerResponse } from "node:http";

import type { RealtimeProvider } from "@mechane/realtime";

import { drainPlayerInvalidations } from "./db/player-invalidation-outbox";

const DEFAULT_DRAIN_BUDGET_MS = 5_000;

export interface PlayerInvalidationCronOptions {
  batchSize?: number;
  budgetMs?: number;
  now?: () => number;
  provider?: RealtimeProvider;
}

export interface PlayerInvalidationCronResult {
  claimed: number;
  delivered: number;
  failed: number;
  budgetExceeded: boolean;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export async function drainPlayerInvalidationsForCron(
  options: PlayerInvalidationCronOptions = {},
): Promise<PlayerInvalidationCronResult> {
  const budgetMs = options.budgetMs ?? DEFAULT_DRAIN_BUDGET_MS;
  const now = options.now ?? Date.now;
  const startedAt = now();
  let claimed = 0;
  let delivered = 0;
  let failed = 0;

  while (now() - startedAt < budgetMs) {
    const batch = await drainPlayerInvalidations({
      batchSize: options.batchSize,
      provider: options.provider,
    });
    claimed += batch.claimed;
    delivered += batch.delivered;
    failed += batch.failed;

    const budgetExceeded = now() - startedAt >= budgetMs;
    if (batch.claimed === 0 || budgetExceeded) {
      return { claimed, delivered, failed, budgetExceeded };
    }
  }

  return { claimed, delivered, failed, budgetExceeded: true };
}

export async function handlePlayerInvalidationCronRoute(
  req: IncomingMessage,
  res: ServerResponse,
  options: PlayerInvalidationCronOptions = {},
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/api/cron/player-invalidations") return false;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed." });
    return true;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    sendJson(res, 401, { error: "Unauthorized." });
    return true;
  }

  sendJson(res, 200, await drainPlayerInvalidationsForCron(options));
  return true;
}

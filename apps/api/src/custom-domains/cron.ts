// Where the Custom Domain checker runs (issue #833): Vercel Cron calls
// `/api/cron/custom-domains` on the same CRON_SCHEDULE as the Player
// invalidation drain, and the dev server runs the same work every 15 seconds.
// Reconciliation runs at most once a day, gated by the shared limiter.
import type { IncomingMessage, ServerResponse } from "node:http";

import { consumeRateLimit, type RateLimitBucket } from "../lib/rate-limit";
import {
  reconcileProjectDomains,
  reservedProjectHosts,
  runCustomDomainChecks,
  type CheckPassResult,
} from "./checker";
import type { CustomDomainsProvider } from "./provider";

const DAILY_RECONCILIATION: RateLimitBucket = {
  name: "custom-domains-reconciliation",
  limit: 1,
  windowSeconds: 24 * 60 * 60,
};

export interface CustomDomainCronResult extends CheckPassResult {
  /** Orphaned hostnames removed from the Player project, or null when reconciliation didn't run. */
  reconciled: string[] | null;
}

/** One checker pass, plus the day's reconciliation if it hasn't run yet. */
export async function runCustomDomainCron(
  provider: CustomDomainsProvider,
  now = new Date(),
): Promise<CustomDomainCronResult> {
  const pass = await runCustomDomainChecks(now, provider);
  const { allowed } = await consumeRateLimit(DAILY_RECONCILIATION, "global");
  const reconciled = allowed
    ? await reconcileProjectDomains(provider, reservedProjectHosts(process.env))
    : null;
  return { ...pass, reconciled };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export async function handleCustomDomainCronRoute(
  req: IncomingMessage,
  res: ServerResponse,
  provider: CustomDomainsProvider,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/api/cron/custom-domains") return false;
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
  sendJson(res, 200, await runCustomDomainCron(provider));
  return true;
}

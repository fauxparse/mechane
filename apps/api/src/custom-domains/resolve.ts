// The Player's host-based entry (ADR-0023): a page served from a Custom
// Domain asks which Device lives at its own hostname, and gets that Device's
// pairing code back to route itself. The hostname is the only input, so the
// route is public. Its answers are cached by the CDN for a minute, and the
// misses that reach the function are rate limited per client network.
import type { IncomingMessage, ServerResponse } from "node:http";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "../db/client";
import { customDomains, devices } from "../db/schema";
import { clientAddress } from "../lib/client-address";
import { applyPublicCorsHeaders } from "../lib/cors";
import { consumeRateLimit, type RateLimitBucket } from "../lib/rate-limit";
import { coveringBlock } from "./blocks";
import { playerDomainCacheTags } from "./cache-tags";
import { LIVE_CUSTOM_DOMAIN_STATUSES, normaliseHostname } from "./hostname";

export const RESOLVE_PATH = "/api/player-domains/resolve";

const RESOLVE_MISSES: RateLimitBucket = {
  name: "player-domain-resolve",
  limit: 60,
  windowSeconds: 60,
};

// Requests with no usable client address share one key rather than going
// unlimited. Production always has one (lib/client-address.ts).
const UNKNOWN_CLIENT = "unknown";

// Browsers keep nothing; the CDN keeps the answer for a minute, which is how
// long a rebind, revoke or block can take to reach a visitor when eviction
// fails.
const RESOLVE_CACHE_CONTROL = "public, max-age=0, s-maxage=60";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/**
 * The pairing code of the Device a hostname opens, or null. It opens one
 * only while its Custom Domain is live, bound to a Device that isn't retired,
 * and not covered by a Blocked Hostname.
 */
export async function resolvePlayerDomain(host: string): Promise<string | null> {
  if (await coveringBlock(host)) return null;
  const [bound] = await db
    .select({ pairingCode: devices.pairingCode })
    .from(customDomains)
    .innerJoin(
      devices,
      and(eq(customDomains.deviceShowId, devices.showId), eq(customDomains.deviceId, devices.id)),
    )
    .where(
      and(
        eq(customDomains.hostname, host),
        inArray(customDomains.status, [...LIVE_CUSTOM_DOMAIN_STATUSES]),
        isNull(devices.retiredAt),
      ),
    );
  return bound?.pairingCode ?? null;
}

/**
 * `GET /api/player-domains/resolve?host=<hostname>`: 200 `{ pairingCode }`
 * when the hostname opens a Device, 404 otherwise, so unknown, unbound,
 * unproven, revoked and blocked hosts are indistinguishable. Both carry the
 * CDN cache headers and a `Vercel-Cache-Tag` for the hostname and each
 * parent, so blocking a parent can evict every cached subdomain.
 */
export async function handlePlayerDomainResolveRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== RESOLVE_PATH) return false;

  if (applyPublicCorsHeaders(res, req.method)) {
    res.statusCode = 204;
    res.end();
    return true;
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    res.setHeader("Cache-Control", "no-store");
    sendJson(res, 405, { error: "Method not allowed." });
    return true;
  }

  const { allowed, retryAfterSeconds } = await consumeRateLimit(
    RESOLVE_MISSES,
    clientAddress(new Headers(req.headers as Record<string, string>)) ?? UNKNOWN_CLIENT,
  );
  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.setHeader("Cache-Control", "no-store");
    sendJson(res, 429, { error: "Too many requests." });
    return true;
  }

  res.setHeader("Cache-Control", RESOLVE_CACHE_CONTROL);
  const host = normaliseHostname(url.searchParams.get("host") ?? "");
  if (host === null) {
    sendJson(res, 404, { error: "Not found." });
    return true;
  }
  res.setHeader("Vercel-Cache-Tag", playerDomainCacheTags(host).join(","));
  const pairingCode = await resolvePlayerDomain(host);
  if (pairingCode === null) sendJson(res, 404, { error: "Not found." });
  else sendJson(res, 200, { pairingCode });
  return true;
}

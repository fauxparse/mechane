// The Player domain resolve route (issue #830) over real HTTP against real
// Postgres: what opens a Device, what doesn't, the cache headers every
// answer carries, and the per-network limit on cache misses.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "../db/client";
import { blockedHostnames, devices } from "../db/schema";
import { setupPostgresTest } from "../db/test-helpers";
import { handlePlayerDomainResolveRoute } from "./resolve";
import { createDevice, insertCustomDomain, uniqueHostname } from "./test-fixtures";

const { userId, showId, createShow } = setupPostgresTest("resolve-test");

afterEach(async () => {
  await db.delete(blockedHostnames).where(eq(blockedHostnames.placedBy, userId));
});

async function serve<T>(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>,
  run: (origin: string) => Promise<T>,
): Promise<T> {
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not start.");
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

// Each test's requests come from their own network, so the shared limiter
// never carries one test's misses into another's.
function randomNetwork(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return `10.${bytes[0]}.${bytes[1]}.${bytes[2]}`;
}

async function resolve(host: string, network = randomNetwork()): Promise<Response> {
  return serve(handlePlayerDomainResolveRoute, (origin) =>
    fetch(`${origin}/api/player-domains/resolve?host=${encodeURIComponent(host)}`, {
      headers: { "X-Forwarded-For": network, Origin: "http://vote.x.localhost:5174" },
    }),
  );
}

function expectCacheHeaders(response: Response, host: string): void {
  expect(response.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60");
  const parent = host.split(".").slice(1).join(".");
  expect(response.headers.get("vercel-cache-tag")).toBe(
    `player-domain:${host},player-domain:${parent}`,
  );
}

async function liveDomainOnDevice(status: "live" | "needs_attention" = "live") {
  await createShow();
  const device = await createDevice(showId);
  const host = `vote.${uniqueHostname("resolve")}`;
  await insertCustomDomain({
    userId,
    hostname: host,
    status,
    deviceShowId: showId,
    deviceId: device.id,
  });
  return { host, device };
}

describe("GET /api/player-domains/resolve", () => {
  it("returns the pairing code of the Device a live domain is bound to", async () => {
    const { host, device } = await liveDomainOnDevice();

    const response = await resolve(host.toUpperCase());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pairingCode: device.pairingCode });
    expectCacheHeaders(response, host);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("keeps resolving while the domain needs attention", async () => {
    const { host, device } = await liveDomainOnDevice("needs_attention");

    const response = await resolve(host);

    expect(await response.json()).toEqual({ pairingCode: device.pairingCode });
  });

  it("returns 404 with the same headers for a host that opens nothing", async () => {
    await createShow();
    const device = await createDevice(showId);
    const unbound = `vote.${uniqueHostname("unbound")}`;
    await insertCustomDomain({ userId, hostname: unbound, status: "live" });
    const unverified = `vote.${uniqueHostname("unverified")}`;
    await insertCustomDomain({
      userId,
      hostname: unverified,
      deviceShowId: showId,
      deviceId: device.id,
    });
    const unknown = `vote.${uniqueHostname("unknown")}`;

    for (const host of [unbound, unverified, unknown]) {
      const response = await resolve(host);
      expect(response.status, host).toBe(404);
      expectCacheHeaders(response, host);
    }
  });

  it("returns 404 once the bound Device is retired", async () => {
    const { host, device } = await liveDomainOnDevice();
    await db.update(devices).set({ retiredAt: new Date() }).where(eq(devices.id, device.id));

    const response = await resolve(host);

    expect(response.status).toBe(404);
    expectCacheHeaders(response, host);
  });

  it("returns 404 when a block covers a parent hostname, until it is lifted", async () => {
    const { host, device } = await liveDomainOnDevice();
    const parent = host.split(".").slice(1).join(".");
    await db
      .insert(blockedHostnames)
      .values({ hostname: parent, reason: "Abuse", placedBy: userId });

    const blocked = await resolve(host);
    expect(blocked.status).toBe(404);
    expectCacheHeaders(blocked, host);

    await db
      .update(blockedHostnames)
      .set({ liftedAt: new Date(), liftedBy: userId })
      .where(eq(blockedHostnames.hostname, parent));
    expect(await (await resolve(host)).json()).toEqual({ pairingCode: device.pairingCode });
  });

  it("refuses the 61st cache miss from one network in a minute", async () => {
    const network = randomNetwork();
    const host = `vote.${uniqueHostname("limited")}`;

    const statuses = await serve(handlePlayerDomainResolveRoute, async (origin) => {
      const seen: Response[] = [];
      for (let attempt = 0; attempt < 61; attempt += 1) {
        seen.push(
          await fetch(`${origin}/api/player-domains/resolve?host=${host}`, {
            headers: { "X-Forwarded-For": network },
          }),
        );
      }
      return seen;
    });

    expect(statuses.slice(0, 60).every((response) => response.status === 404)).toBe(true);
    const refused = statuses[60]!;
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await resolve(host)).status).toBe(404);
  });
});

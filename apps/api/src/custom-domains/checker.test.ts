// The Custom Domain checker (issue #833) with the in-memory provider and a
// controllable clock, against real Postgres. Each test scopes its passes to
// its own hostnames and its own provider budget, since the test database
// and the shared limiter are shared with other test files.
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "../db/client";
import { blockedHostnames, customDomains, playerInvalidationOutbox, user } from "../db/schema";
import { setupPostgresTest } from "../db/test-helpers";
import { consumeRateLimit } from "../lib/rate-limit";
import { playerDomainCacheTags } from "./cache-tags";
import {
  CONTESTED,
  PROVIDER_ADD_BUDGET,
  reconcileProjectDomains,
  runCustomDomainChecks,
  WAITING_FOR_PROVIDER,
} from "./checker";
import { createFakeCustomDomainsProvider, type FakeCustomDomainsProvider } from "./fake-provider";
import { ownershipProofRecord } from "./records";
import { createDevice, createUser, insertCustomDomain, uniqueHostname } from "./test-fixtures";

const { userId, showId, createShow } = setupPostgresTest("checker-test");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const otherUsers: string[] = [];
afterEach(async () => {
  await db.delete(blockedHostnames).where(eq(blockedHostnames.placedBy, userId));
  for (const id of otherUsers.splice(0)) await db.delete(user).where(eq(user.id, id));
});

interface Harness {
  fake: FakeCustomDomainsProvider;
  hostnames: string[];
  budgetKey: string;
  pass(): Promise<void>;
  advance(milliseconds: number): void;
  add(
    owner: string,
    hostname: string,
    values?: Partial<typeof customDomains.$inferInsert>,
  ): Promise<typeof customDomains.$inferSelect>;
  prove(row: { hostname: string; proofToken: string }, ...others: { proofToken: string }[]): void;
}

function harness(): Harness {
  const fake = createFakeCustomDomainsProvider();
  const hostnames: string[] = [];
  const budgetKey = `checker-test-${crypto.randomUUID()}`;
  return {
    fake,
    hostnames,
    budgetKey,
    async pass() {
      // No wall-clock budget: a slow CI runner mustn't cut a pass short.
      await runCustomDomainChecks(fake.clock.now(), fake, {
        hostnames,
        budgetKey,
        budgetMs: Number.POSITIVE_INFINITY,
      });
    },
    advance(milliseconds) {
      fake.clock.advance(milliseconds);
    },
    async add(owner, hostname, values = {}) {
      if (!hostnames.includes(hostname)) hostnames.push(hostname);
      const now = fake.clock.now();
      return insertCustomDomain({
        userId: owner,
        hostname,
        addedAt: now,
        checkWindowStartedAt: now,
        nextCheckDueAt: now,
        ...values,
      });
    },
    prove(row, ...others) {
      fake.setProof(
        row.hostname,
        [row, ...others].map(
          (domain) => ownershipProofRecord(row.hostname, domain.proofToken).value,
        ),
      );
    },
  };
}

async function reload(id: string) {
  const [row] = await db.select().from(customDomains).where(eq(customDomains.id, id));
  return row!;
}

async function invalidations(): Promise<number> {
  const rows = await db
    .select({ id: playerInvalidationOutbox.id })
    .from(playerInvalidationOutbox)
    .where(eq(playerInvalidationOutbox.showId, showId));
  return rows.length;
}

describe("the Custom Domain checker", () => {
  it("walks a domain through every transition, and a 7-day lapse keeps its binding", async () => {
    await createShow();
    const device = await createDevice(showId);
    const h = harness();
    const hostname = `vote.${uniqueHostname("walk")}`;
    const domain = await h.add(userId, hostname, { deviceShowId: showId, deviceId: device.id });

    // Unverified until this domain's own proof is published.
    await h.pass();
    expect((await reload(domain.id)).status).toBe("unverified");
    expect(h.fake.count("addProjectDomain")).toBe(0);

    // Unverified → Connecting: proven, added to the project, still misconfigured.
    h.prove(domain);
    h.fake.setMisconfigured(hostname, true);
    h.advance(MINUTE);
    await h.pass();
    let row = await reload(domain.id);
    expect(row.status).toBe("connecting");
    expect(row.provenAt).toEqual(h.fake.clock.now());
    expect(h.fake.projectDomains.has(hostname)).toBe(true);
    expect(row.statusReason).toMatch(/doesn't point at Mechanē/);
    expect(row.dnsRecords?.recommended).toHaveLength(1);

    // Connecting → Securing, held there by a failing HTTPS check.
    h.fake.setMisconfigured(hostname, false);
    h.fake.setHttpsFailure(hostname, "The address doesn't have a valid certificate yet.");
    h.advance(MINUTE);
    await h.pass();
    row = await reload(domain.id);
    expect(row.status).toBe("securing");
    expect(row.statusReason).toBe("The address doesn't have a valid certificate yet.");

    // Securing → Live.
    h.fake.setHttpsFailure(hostname, null);
    h.advance(MINUTE);
    await h.pass();
    row = await reload(domain.id);
    expect(row.status).toBe("live");
    expect(row.wentLiveAt).toEqual(h.fake.clock.now());
    expect(row.nextCheckDueAt).toEqual(new Date(h.fake.clock.now().getTime() + DAY));

    // Live → Needs attention on a failed recheck, with the reason.
    h.fake.setHttpsFailure(hostname, "The address refused the connection.");
    h.advance(DAY);
    await h.pass();
    row = await reload(domain.id);
    expect(row.status).toBe("needs_attention");
    expect(row.statusReason).toBe("The address refused the connection.");

    // Needs attention → Live when rechecks pass.
    h.fake.setHttpsFailure(hostname, null);
    h.advance(15 * MINUTE);
    await h.pass();
    expect((await reload(domain.id)).status).toBe("live");

    // The proof goes missing: Needs attention, then a lapse after 7 days.
    h.fake.setProof(hostname, []);
    h.advance(DAY);
    await h.pass();
    row = await reload(domain.id);
    expect(row.status).toBe("needs_attention");
    expect(row.proofWentMissingAt).toEqual(h.fake.clock.now());

    h.advance(6 * DAY);
    await h.pass();
    expect((await reload(domain.id)).status).toBe("needs_attention");
    expect(h.fake.projectDomains.has(hostname)).toBe(true);

    h.advance(DAY);
    await h.pass();
    row = await reload(domain.id);
    expect(row.status).toBe("unverified");
    expect(h.fake.projectDomains.has(hostname)).toBe(false);
    expect(h.fake.count("removeProjectDomain", hostname)).toBe(1);
    expect({ showId: row.deviceShowId, deviceId: row.deviceId }).toEqual({
      showId,
      deviceId: device.id,
    });
  });

  it("checks a pending domain every minute, every 15 after 10 minutes, and not after 72 hours", async () => {
    await createShow();
    const h = harness();
    const domain = await h.add(userId, uniqueHostname("schedule"));
    const start = h.fake.clock.now().getTime();

    await h.pass();
    expect((await reload(domain.id)).nextCheckDueAt).toEqual(new Date(start + MINUTE));

    h.advance(10 * MINUTE);
    await h.pass();
    expect((await reload(domain.id)).nextCheckDueAt).toEqual(new Date(start + 25 * MINUTE));

    h.advance(72 * HOUR - 10 * MINUTE);
    await h.pass();
    const dormant = await reload(domain.id);
    expect(dormant.nextCheckDueAt).toBeNull();

    h.advance(DAY);
    await h.pass();
    expect((await reload(domain.id)).lastCheckedAt).toEqual(dormant.lastCheckedAt);
  });

  it("lets a challenger take over while the holder's proof is absent", async () => {
    await createShow();
    const device = await createDevice(showId);
    const challenger = await createUser("checker-test-challenger");
    otherUsers.push(challenger);
    const h = harness();
    const hostname = `vote.${uniqueHostname("takeover")}`;
    h.fake.projectDomains.add(hostname);
    const held = await h.add(userId, hostname, {
      status: "live",
      provenAt: h.fake.clock.now(),
      providerAddedAt: h.fake.clock.now(),
      nextCheckDueAt: new Date(h.fake.clock.now().getTime() + DAY),
      deviceShowId: showId,
      deviceId: device.id,
    });
    const challenge = await h.add(challenger, hostname);

    h.prove(challenge);
    await h.pass();

    const displaced = await reload(held.id);
    expect(displaced.status).toBe("unverified");
    expect(displaced.deviceId).toBe(device.id);
    expect((await reload(challenge.id)).status).toBe("live");
    expect(h.fake.count("addProjectDomain")).toBe(0);
    expect(h.fake.evictions).toContainEqual(playerDomainCacheTags(hostname));
    expect(await invalidations()).toBeGreaterThan(0);
  });

  it("keeps the hostname with its holder while both proofs are present", async () => {
    await createShow();
    const challenger = await createUser("checker-test-challenger");
    otherUsers.push(challenger);
    const h = harness();
    const hostname = uniqueHostname("hold");
    const held = await h.add(userId, hostname, {
      status: "live",
      provenAt: h.fake.clock.now(),
      providerAddedAt: h.fake.clock.now(),
      nextCheckDueAt: null,
    });
    const challenge = await h.add(challenger, hostname);

    h.prove(challenge, held);
    await h.pass();

    const contested = await reload(challenge.id);
    expect(contested.status).toBe("unverified");
    expect(contested.statusReason).toBe(CONTESTED);
    expect((await reload(held.id)).status).toBe("live");
  });

  it("keeps a blocked hostname Unverified even with its proof in place", async () => {
    await createShow();
    const h = harness();
    const parent = uniqueHostname("blocked");
    const domain = await h.add(userId, `vote.${parent}`);
    await db
      .insert(blockedHostnames)
      .values({ hostname: parent, reason: "Abuse", placedBy: userId });

    h.prove(domain);
    await h.pass();

    expect((await reload(domain.id)).status).toBe("unverified");
    expect(h.fake.count("lookupOwnershipProof")).toBe(0);
    expect(h.fake.count("addProjectDomain")).toBe(0);
  });

  it("queues proven domains past the hourly add budget in the order they were proven", async () => {
    await createShow();
    const h = harness();
    const first = [];
    for (let index = 0; index < 80; index += 1) {
      first.push(await h.add(userId, uniqueHostname(`budget-${index}`)));
    }
    for (const domain of first) h.prove(domain);
    await h.pass();
    expect(h.fake.count("addProjectDomain")).toBe(80);

    h.advance(MINUTE);
    const earlier = await h.add(userId, uniqueHostname("queued-earlier"));
    h.prove(earlier);
    await h.pass();
    h.advance(MINUTE);
    const later = await h.add(userId, uniqueHostname("queued-later"));
    h.prove(later);
    await h.pass();

    for (const queued of [earlier, later]) {
      const row = await reload(queued.id);
      expect(row.status).toBe("connecting");
      expect(row.providerAddedAt).toBeNull();
      expect(row.statusReason).toBe(WAITING_FOR_PROVIDER);
    }

    // A new window with room for one more add serves the earlier proof first.
    const nextWindow = `${h.budgetKey}-next`;
    for (let index = 0; index < 79; index += 1) {
      await consumeRateLimit(PROVIDER_ADD_BUDGET, nextWindow);
    }
    h.advance(MINUTE);
    await runCustomDomainChecks(h.fake.clock.now(), h.fake, {
      hostnames: h.hostnames,
      budgetKey: nextWindow,
      budgetMs: Number.POSITIVE_INFINITY,
    });
    expect((await reload(earlier.id)).status).toBe("live");
    expect((await reload(later.id)).providerAddedAt).toBeNull();
  }, 60_000);

  it("backs off until the provider's retry time when it is rate limited", async () => {
    await createShow();
    const h = harness();
    const domain = await h.add(userId, uniqueHostname("backoff"));
    const retryAt = new Date(h.fake.clock.now().getTime() + 10 * MINUTE);
    h.fake.rateLimitUntil(retryAt);

    h.prove(domain);
    await h.pass();

    const row = await reload(domain.id);
    expect(row.status).toBe("connecting");
    expect(row.nextCheckDueAt).toEqual(retryAt);
    expect(row.statusReason).toBe(WAITING_FOR_PROVIDER);
  });

  it("calls verify only while a challenge is outstanding, at most every 5 minutes", async () => {
    await createShow();
    const h = harness();
    const challenged = await h.add(userId, uniqueHostname("challenged"));
    const plain = await h.add(userId, uniqueHostname("plain"));
    h.fake.setChallenge(challenged.hostname, {
      type: "TXT",
      name: `_vercel.${challenged.hostname}`,
      value: "vc-domain-verify=challenge",
    });
    h.fake.setVerifySucceeds(challenged.hostname, false);
    h.fake.setMisconfigured(plain.hostname, true);
    h.prove(challenged);
    h.prove(plain);

    await h.pass();
    expect(h.fake.count("verifyProjectDomain", challenged.hostname)).toBe(1);
    const row = await reload(challenged.id);
    expect(row.status).toBe("connecting");
    expect(row.dnsRecords?.verification).toHaveLength(1);

    h.advance(MINUTE);
    await h.pass();
    expect(h.fake.count("verifyProjectDomain", challenged.hostname)).toBe(1);

    h.advance(5 * MINUTE);
    await h.pass();
    expect(h.fake.count("verifyProjectDomain", challenged.hostname)).toBe(2);
    expect(h.fake.count("verifyProjectDomain", plain.hostname)).toBe(0);
  });

  it("evicts and invalidates on entering and leaving the live set, not in between", async () => {
    await createShow();
    const device = await createDevice(showId);
    const h = harness();
    const domain = await h.add(userId, uniqueHostname("effects"), {
      deviceShowId: showId,
      deviceId: device.id,
    });
    const tags = playerDomainCacheTags(domain.hostname);

    h.prove(domain);
    await h.pass();
    expect((await reload(domain.id)).status).toBe("live");
    expect(h.fake.evictions).toEqual([tags]);
    const afterLive = await invalidations();
    expect(afterLive).toBeGreaterThan(0);

    // Needs attention is still live: nothing to evict.
    h.fake.setHttpsFailure(domain.hostname, "The address refused the connection.");
    h.advance(DAY);
    await h.pass();
    expect(h.fake.evictions).toEqual([tags]);

    h.fake.setProof(domain.hostname, []);
    h.advance(15 * MINUTE);
    await h.pass();
    h.advance(7 * DAY);
    await h.pass();
    expect((await reload(domain.id)).status).toBe("unverified");
    expect(h.fake.evictions).toEqual([tags, tags]);
    expect(await invalidations()).toBeGreaterThanOrEqual(afterLive);
  });
});

describe("reconcileProjectDomains", () => {
  it("removes a project domain nothing proves, sparing reserved and proven hosts", async () => {
    await createShow();
    const h = harness();
    const proven = await h.add(userId, uniqueHostname("proven"), { status: "live" });
    const revoked = await h.add(userId, uniqueHostname("revoked"), { status: "revoked" });
    const orphan = uniqueHostname("orphan");
    for (const hostname of [proven.hostname, revoked.hostname, orphan, "show.mechane.live"]) {
      h.fake.projectDomains.add(hostname);
    }

    const removed = await reconcileProjectDomains(h.fake, ["show.mechane.live"]);

    expect(removed.sort()).toEqual([orphan, revoked.hostname].sort());
    expect([...h.fake.projectDomains].sort()).toEqual(
      [proven.hostname, "show.mechane.live"].sort(),
    );
  });
});

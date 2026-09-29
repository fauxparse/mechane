// The records every other Custom Domains slice stands on (issue #829),
// against real Postgres: the unique indexes (per-user-per-hostname and the
// partial one that keeps a hostname proven at most once), the Device
// binding's lifecycle, and Blocked Hostname coverage.
import { CODE_ALPHABET } from "@mechane/domain/pairing-code";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "../db/client";
import { blockedHostnames, customDomains, devices, shows, user } from "../db/schema";
import { setupPostgresTest } from "../db/test-helpers";
import { coveringBlock } from "./blocks";
import { PROVEN_CUSTOM_DOMAIN_STATUSES } from "./hostname";

const { userId, showId, createShow } = setupPostgresTest("custom-domains-test");

// Hostnames and pairing codes carry run-scoped randomness: the test database
// is shared, and the unique indexes under test must not collide across runs.
const runId = crypto.randomUUID().slice(0, 8);
const hostname = (label: string) => `${label}-${runId}.nz`;

const secondUsers: string[] = [];

function pairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]!).join("");
}

async function createSecondUser(): Promise<string> {
  const id = `custom-domains-second-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    name: "Custom Domains Second User",
    email: `${id}@example.com`,
    emailVerified: true,
  });
  secondUsers.push(id);
  return id;
}

async function createDevice(id: string): Promise<void> {
  await db.insert(devices).values({ id, showId, pairingCode: pairingCode() });
}

async function insertDomain(
  owner: string,
  host: string,
  extra: Partial<typeof customDomains.$inferInsert> = {},
): Promise<void> {
  await db.insert(customDomains).values({
    userId: owner,
    hostname: host,
    status: "unverified",
    proofToken: `proof-${host}`,
    ...extra,
  });
}

/** Runs a write that must violate a constraint, and names the constraint. */
async function violatedConstraint(run: () => Promise<unknown>): Promise<string> {
  return run().then(
    () => {
      throw new Error("Expected a constraint violation.");
    },
    (error: { constraint?: string; cause?: { constraint?: string } }) =>
      error.constraint ?? error.cause?.constraint ?? String(error),
  );
}

afterEach(async () => {
  await db.delete(blockedHostnames).where(eq(blockedHostnames.placedBy, userId));
  for (const id of secondUsers.splice(0)) {
    await db.delete(user).where(eq(user.id, id));
  }
});

describe("custom_domains", () => {
  it("holds the same hostname unverified for two different users", async () => {
    await createShow();
    const secondUser = await createSecondUser();
    const host = hostname("contested");

    await insertDomain(userId, host);
    await insertDomain(secondUser, host);

    const rows = await db.select().from(customDomains).where(eq(customDomains.hostname, host));
    expect(rows.map((row) => row.userId).sort()).toEqual([secondUser, userId].sort());
  });

  it("refuses a second proven row for the same hostname, in every proven status", async () => {
    await createShow();
    const secondUser = await createSecondUser();

    for (const status of PROVEN_CUSTOM_DOMAIN_STATUSES) {
      const host = hostname(`proven-${status}`);
      await insertDomain(userId, host, { status: "live", provenAt: new Date() });
      const constraint = await violatedConstraint(() => insertDomain(secondUser, host, { status }));
      expect(constraint).toBe("custom_domains_hostname_proven_unique");
    }
  });

  it("lets unverified and revoked rows coexist with a proven one", async () => {
    await createShow();
    const unverifiedUser = await createSecondUser();
    const revokedUser = await createSecondUser();
    const host = hostname("mixed");

    await insertDomain(userId, host, { status: "live", provenAt: new Date() });
    await insertDomain(unverifiedUser, host, { status: "unverified" });
    await insertDomain(revokedUser, host, { status: "revoked", revocationReason: "test" });

    const rows = await db.select().from(customDomains).where(eq(customDomains.hostname, host));
    expect(rows.map((row) => row.status).sort()).toEqual(["live", "revoked", "unverified"]);
  });

  it("keeps one domain per user per hostname", async () => {
    await createShow();
    const host = hostname("single");
    await insertDomain(userId, host);

    const constraint = await violatedConstraint(() =>
      insertDomain(userId, host, { status: "live", provenAt: new Date() }),
    );
    expect(constraint).toBe("custom_domains_user_hostname_unique");
  });

  it("binds a Device to at most one domain", async () => {
    await createShow();
    await createDevice("device_bound");
    await insertDomain(userId, hostname("first"), {
      deviceShowId: showId,
      deviceId: "device_bound",
    });

    const constraint = await violatedConstraint(() =>
      insertDomain(userId, hostname("second"), {
        deviceShowId: showId,
        deviceId: "device_bound",
      }),
    );
    expect(constraint).toBe("custom_domains_device_unique");
  });

  it("unbinds its domains rather than deleting them when the Show goes", async () => {
    await createShow();
    await createDevice("device_leaving");
    const host = hostname("leaving");
    await insertDomain(userId, host, {
      deviceShowId: showId,
      deviceId: "device_leaving",
      status: "live",
      provenAt: new Date(),
    });

    await db.delete(shows).where(eq(shows.id, showId));

    const row = (await db.select().from(customDomains).where(eq(customDomains.hostname, host)))[0];
    expect(row).toBeDefined();
    expect(row?.deviceShowId).toBeNull();
    expect(row?.deviceId).toBeNull();
  });
});

describe("coveringBlock", () => {
  async function placeBlock(host: string): Promise<void> {
    await db
      .insert(blockedHostnames)
      .values({ hostname: host, reason: "test block", placedBy: userId });
  }

  it("covers the hostname itself and every descendant", async () => {
    const blocked = hostname("knifef1ght");
    await placeBlock(blocked);

    await expect(coveringBlock(blocked)).resolves.toMatchObject({ hostname: blocked });
    await expect(coveringBlock(`vote.${blocked}`)).resolves.toMatchObject({ hostname: blocked });
    await expect(coveringBlock(`a.b.${blocked}`)).resolves.toMatchObject({ hostname: blocked });
  });

  it("covers nothing outside the blocked hostname's subtree", async () => {
    const blocked = hostname("knifef1ght");
    await placeBlock(blocked);
    // A block on a descendant doesn't reach up, either.
    await placeBlock(`sub.${hostname("upward")}`);

    await expect(coveringBlock(`not${blocked}`)).resolves.toBeNull();
    await expect(coveringBlock(hostname("upward"))).resolves.toBeNull();
  });

  it("covers nothing once lifted, and lifting keeps the row", async () => {
    const blocked = hostname("lifted");
    await placeBlock(blocked);

    await db
      .update(blockedHostnames)
      .set({ liftedAt: new Date(), liftedBy: userId })
      .where(eq(blockedHostnames.hostname, blocked));

    await expect(coveringBlock(`vote.${blocked}`)).resolves.toBeNull();
    const row = (
      await db.select().from(blockedHostnames).where(eq(blockedHostnames.hostname, blocked))
    )[0];
    expect(row?.liftedAt).toBeInstanceOf(Date);
    expect(row?.reason).toBe("test block");
  });

  it("allows blocking a hostname again once its previous block was lifted", async () => {
    const blocked = hostname("reblock");
    await placeBlock(blocked);

    const constraint = await violatedConstraint(() => placeBlock(blocked));
    expect(constraint).toBe("blocked_hostnames_hostname_active_unique");

    await db
      .update(blockedHostnames)
      .set({ liftedAt: new Date(), liftedBy: userId })
      .where(eq(blockedHostnames.hostname, blocked));
    await placeBlock(blocked);

    await expect(coveringBlock(`vote.${blocked}`)).resolves.toMatchObject({
      hostname: blocked,
      liftedAt: null,
    });
    const rows = await db
      .select()
      .from(blockedHostnames)
      .where(eq(blockedHostnames.hostname, blocked));
    expect(rows).toHaveLength(2);
  });
});

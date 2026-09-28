// Moderating Custom Domains (issue #839) through GraphQL: every operation
// needs the customDomain permission; revoking blocks, removes from the
// provider, stops resolve and emails the owner; unblocking returns Revoked
// domains to Unverified and keeps the block's record.
import { generateId } from "@mechane/domain/id";
import { eq, inArray } from "drizzle-orm";
import { createYoga } from "graphql-yoga";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeCustomDomainsProvider } from "../custom-domains/fake-provider";
import { resolvePlayerDomain } from "../custom-domains/resolve";
import { createDevice, insertCustomDomain, uniqueHostname } from "../custom-domains/test-fixtures";
import { db } from "../db/client";
import { blockedHostnames, customDomains, shows, user } from "../db/schema";
import type { GraphQLContext } from "./context";
import { schema } from "./schema";

const createdUserIds: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  const ids = createdUserIds.splice(0);
  if (ids.length === 0) return;
  await db.delete(blockedHostnames).where(inArray(blockedHostnames.placedBy, ids));
  await db.delete(user).where(inArray(user.id, ids));
});

async function account(role: "user" | "admin", fake = createFakeCustomDomainsProvider()) {
  const id = `custom-domains-admin-${crypto.randomUUID()}`;
  const email = `${id}@example.test`;
  await db.insert(user).values({ id, name: "Account", email, emailVerified: true, role });
  createdUserIds.push(id);
  const context: GraphQLContext = {
    userId: id,
    user: { id, name: "Account", email, emailVerified: true, role },
    customDomains: { provider: fake },
  };
  return { id, email, context, fake };
}

async function execute<T>(
  context: GraphQLContext,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data?: T | null; errors?: { message: string; extensions?: { code?: string } }[] }> {
  const yoga = createYoga<GraphQLContext>({
    schema,
    context: () => context,
    graphqlEndpoint: "/api/graphql",
    maskedErrors: false,
  });
  const response = await yoga.fetch("http://localhost/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return (await response.json()) as never;
}

const FIND = `query ($hostname: String) { adminCustomDomains(hostname: $hostname) { id } }`;
const REVOKE = `mutation ($hostname: String!, $reason: String!) {
  revokeCustomDomain(hostname: $hostname, reason: $reason) {
    id status revocationReason ownerEmail block { hostname reason }
  }
}`;
const BLOCK = `mutation ($hostname: String!, $reason: String!) {
  blockHostname(hostname: $hostname, reason: $reason) { hostname reason }
}`;
const UNBLOCK = `mutation ($hostname: String!) {
  unblockHostname(hostname: $hostname) { hostname liftedBy liftedAt }
}`;
const ADD = `mutation ($hostname: String!, $showId: ID!, $deviceId: ID!) {
  addCustomDomain(hostname: $hostname, showId: $showId, deviceId: $deviceId) { id }
}`;

/** An owner with a live domain on a Device of a Show called "Knife Fight". */
async function liveDomain(hostname: string) {
  const owner = await account("user");
  const showId = generateId("show");
  await db.insert(shows).values({ id: showId, name: "Knife Fight", userId: owner.id });
  const device = await createDevice(showId);
  const domain = await insertCustomDomain({
    userId: owner.id,
    hostname,
    status: "live",
    deviceShowId: showId,
    deviceId: device.id,
  });
  return { owner, showId, device, domain };
}

describe("admin Custom Domain operations", () => {
  it("forbid a user and allow an admin", async () => {
    const caller = await account("user");
    const admin = await account("admin");
    const hostname = uniqueHostname("permissions");
    const operations: [string, Record<string, unknown>][] = [
      [FIND, { hostname }],
      [REVOKE, { hostname, reason: "Phishing" }],
      [BLOCK, { hostname, reason: "Phishing" }],
      [UNBLOCK, { hostname }],
    ];

    for (const [query, variables] of operations) {
      const result = await execute(caller.context, query, variables);
      expect(result.errors?.[0]?.extensions?.code, query).toBe("FORBIDDEN");
    }
    for (const [query, variables] of operations) {
      const result = await execute(admin.context, query, variables);
      expect(result.errors, query).toBeUndefined();
    }
  });

  it("revokes: blocks, removes from the provider, stops resolve and emails the owner", async () => {
    const admin = await account("admin");
    const hostname = uniqueHostname("revoked");
    const { owner, domain } = await liveDomain(hostname);
    admin.fake.projectDomains.add(hostname);
    const email = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = await execute<{
      revokeCustomDomain: {
        id: string;
        status: string;
        revocationReason: string;
        block: { hostname: string; reason: string };
      }[];
    }>(admin.context, REVOKE, { hostname, reason: "Impersonating another organisation." });

    expect(result.data?.revokeCustomDomain).toEqual([
      {
        id: domain.id,
        status: "revoked",
        revocationReason: "Impersonating another organisation.",
        ownerEmail: owner.email,
        block: { hostname, reason: "Impersonating another organisation." },
      },
    ]);
    expect(admin.fake.count("removeProjectDomain", hostname)).toBe(1);
    expect(admin.fake.projectDomains.has(hostname)).toBe(false);
    expect(await resolvePlayerDomain(hostname)).toBeNull();
    expect(await resolvePlayerDomain(`vote.${hostname}`)).toBeNull();

    const sent = email.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.startsWith("[email]"));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain(`to=${owner.email}`);
    expect(sent[0]).toContain(hostname);
    expect(sent[0]).toContain("Impersonating another organisation.");
    expect(sent[0]).toContain("Knife Fight");
  });

  it("requires a reason", async () => {
    const admin = await account("admin");

    const result = await execute(admin.context, BLOCK, {
      hostname: uniqueHostname("reasonless"),
      reason: "  ",
    });

    expect(result.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
  });

  it("blocks an unclaimed hostname, stopping a later add beneath it", async () => {
    const admin = await account("admin");
    const owner = await account("user");
    const showId = generateId("show");
    await db.insert(shows).values({ id: showId, name: "Show", userId: owner.id });
    const device = await createDevice(showId);
    const hostname = uniqueHostname("unclaimed");

    await execute(admin.context, BLOCK, { hostname, reason: "Reserved for a partner" });
    const added = await execute(owner.context, ADD, {
      hostname: `vote.${hostname}`,
      showId,
      deviceId: device.id,
    });

    expect(added.errors?.[0]?.extensions?.code).toBe("HOSTNAME_BLOCKED");
    expect(admin.fake.evictions).toEqual([[`player-domain:${hostname}`]]);
  });

  it("unblocks: Revoked domains return to Unverified and the block keeps who lifted it", async () => {
    const admin = await account("admin");
    const hostname = uniqueHostname("unblocked");
    const { domain } = await liveDomain(hostname);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await execute(admin.context, REVOKE, { hostname, reason: "Phishing" });

    const result = await execute<{
      unblockHostname: { hostname: string; liftedBy: string; liftedAt: string };
    }>(admin.context, UNBLOCK, { hostname });

    expect(result.data?.unblockHostname).toMatchObject({ hostname, liftedBy: admin.id });
    const [restored] = await db.select().from(customDomains).where(eq(customDomains.id, domain.id));
    expect(restored?.status).toBe("unverified");
    const blocks = await db
      .select()
      .from(blockedHostnames)
      .where(eq(blockedHostnames.hostname, hostname));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.liftedBy).toBe(admin.id);
    expect(blocks[0]?.liftedAt).not.toBeNull();
  });
});

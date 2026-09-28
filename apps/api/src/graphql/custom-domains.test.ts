// Custom Domain owner operations (issue #835) through GraphQL against real
// Postgres, with the in-memory domains provider: the limits, refusals,
// binding rules, cascades and side effects Studio relies on.
import { generateId } from "@mechane/domain/id";
import { eq, inArray } from "drizzle-orm";
import { createYoga } from "graphql-yoga";
import { afterEach, describe, expect, it } from "vitest";

import { runCustomDomainChecks } from "../custom-domains/checker";
import { createFakeCustomDomainsProvider } from "../custom-domains/fake-provider";
import { ownershipProofRecord } from "../custom-domains/records";
import { createDevice, uniqueHostname } from "../custom-domains/test-fixtures";
import { playerDomainCacheTags } from "../custom-domains/cache-tags";
import { db } from "../db/client";
import { blockedHostnames, customDomains, shows, user } from "../db/schema";
import { seedShow } from "../db/seeds/shows/navigation-proof/navigation-proof";
import { publishShowGraph } from "../db/show-graph";
import type { GraphQLContext } from "./context";
import { schema } from "./schema";

const createdUserIds: string[] = [];

afterEach(async () => {
  const ids = createdUserIds.splice(0);
  if (ids.length === 0) return;
  await db.delete(blockedHostnames).where(inArray(blockedHostnames.placedBy, ids));
  await db.delete(user).where(inArray(user.id, ids));
});

interface Owner {
  id: string;
  showId: string;
  context: GraphQLContext;
  fake: ReturnType<typeof createFakeCustomDomainsProvider>;
}

/** A fresh user with one Show, so limits keyed by user start empty. */
async function owner(): Promise<Owner> {
  const id = `custom-domains-gql-${crypto.randomUUID()}`;
  const email = `${id}@example.test`;
  await db.insert(user).values({ id, name: "Owner", email, emailVerified: true });
  createdUserIds.push(id);
  const showId = generateId("show");
  await db.insert(shows).values({ id: showId, name: "Knife Fight", userId: id });
  const fake = createFakeCustomDomainsProvider();
  return {
    id,
    showId,
    fake,
    context: {
      userId: id,
      user: { id, name: "Owner", email, emailVerified: true, role: "user" },
      customDomains: { provider: fake, budgetKey: `custom-domains-gql-${crypto.randomUUID()}` },
    },
  };
}

interface GraphQLResult<T> {
  data?: T | null;
  errors?: { message: string; extensions?: Record<string, unknown> }[];
}

async function execute<T>(
  context: GraphQLContext,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GraphQLResult<T>> {
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
  return (await response.json()) as GraphQLResult<T>;
}

const FIELDS = `id hostname status records { type name value } binding { showId deviceId }`;
const ADD = `mutation ($hostname: String!, $showId: ID!, $deviceId: ID!) {
  addCustomDomain(hostname: $hostname, showId: $showId, deviceId: $deviceId) { ${FIELDS} }
}`;
const BIND = `mutation ($id: ID!, $showId: ID!, $deviceId: ID!) {
  bindCustomDomain(id: $id, showId: $showId, deviceId: $deviceId) { ${FIELDS} }
}`;
const REMOVE = `mutation ($id: ID!) { removeCustomDomain(id: $id) }`;
const CHECK_NOW = `mutation ($id: ID!) { checkCustomDomainNow(id: $id) { ${FIELDS} } }`;
const LIST = `query ($showId: ID) {
  customDomains(showId: $showId) { ${FIELDS} }
  unboundCustomDomains { id }
}`;

interface DomainResult {
  id: string;
  hostname: string;
  status: string;
  records: { type: string; name: string; value: string }[];
  binding: { showId: string; deviceId: string } | null;
}

async function add(o: Owner, hostname: string, deviceId: string) {
  return execute<{ addCustomDomain: DomainResult }>(o.context, ADD, {
    hostname,
    showId: o.showId,
    deviceId,
  });
}

async function addOrThrow(o: Owner, hostname: string, deviceId: string): Promise<DomainResult> {
  const result = await add(o, hostname, deviceId);
  if (!result.data?.addCustomDomain) throw new Error(JSON.stringify(result.errors));
  return result.data.addCustomDomain;
}

async function row(id: string) {
  const [domain] = await db.select().from(customDomains).where(eq(customDomains.id, id));
  return domain;
}

async function makeLive(o: Owner, domain: DomainResult): Promise<void> {
  const [stored] = await db.select().from(customDomains).where(eq(customDomains.id, domain.id));
  o.fake.setProof(domain.hostname, [
    ownershipProofRecord(domain.hostname, stored!.proofToken).value,
  ]);
  await runCustomDomainChecks(new Date(), o.fake, {
    hostnames: [domain.hostname],
    budgetKey: o.context.customDomains?.budgetKey,
  });
  expect((await row(domain.id))?.status).toBe("live");
}

// Every Player invalidation bumps its Show's state sequence (ADR-0015).
async function stateSequence(showId: string): Promise<number> {
  const [show] = await db
    .select({ stateSequence: shows.stateSequence })
    .from(shows)
    .where(eq(shows.id, showId));
  return show!.stateSequence;
}

describe("addCustomDomain", () => {
  it("adds a bound, Unverified domain showing its _mechane TXT record", async () => {
    const o = await owner();
    const device = await createDevice(o.showId);
    const hostname = uniqueHostname("added");

    const domain = await addOrThrow(o, `https://${hostname.toUpperCase()}/`, device.id);

    expect(domain.hostname).toBe(hostname);
    expect(domain.status).toBe("unverified");
    expect(domain.binding).toEqual({ showId: o.showId, deviceId: device.id });
    expect(domain.records).toEqual([
      ownershipProofRecord(hostname, (await row(domain.id))!.proofToken),
    ]);
  });

  it("refuses the 11th domain, counting every status", async () => {
    const o = await owner();
    const device = await createDevice(o.showId);
    for (let index = 0; index < 10; index += 1) {
      await addOrThrow(o, uniqueHostname(`cap-${index}`), device.id);
    }
    await db.update(customDomains).set({ status: "revoked" }).where(eq(customDomains.userId, o.id));

    const refused = await add(o, uniqueHostname("eleventh"), device.id);

    expect(refused.errors?.[0]?.extensions?.code).toBe("CUSTOM_DOMAIN_CAP_REACHED");
    expect(refused.errors?.[0]?.message).toBe(
      "You're using all 10 custom domains. Remove one to add another.",
    );
  });

  it("refuses the 21st add in a day, even after removals, with the hours left", async () => {
    const o = await owner();
    const device = await createDevice(o.showId);
    for (let round = 0; round < 2; round += 1) {
      const added = [];
      for (let index = 0; index < 10; index += 1) {
        added.push(await addOrThrow(o, uniqueHostname(`window-${round}-${index}`), device.id));
      }
      for (const domain of added) await execute(o.context, REMOVE, { id: domain.id });
    }

    const refused = await add(o, uniqueHostname("twenty-first"), device.id);

    expect(refused.errors?.[0]?.extensions?.code).toBe("RATE_LIMITED");
    expect(refused.errors?.[0]?.extensions?.hoursLeft).toBe(24);
    expect(refused.errors?.[0]?.message).toBe(
      "You've added 20 domains today. Try again in 24 hours.",
    );
  });

  it("refuses a refused or blocked hostname", async () => {
    const o = await owner();
    const device = await createDevice(o.showId);
    const parent = uniqueHostname("blocked");
    await db.insert(blockedHostnames).values({ hostname: parent, reason: "Abuse", placedBy: o.id });

    const results = await Promise.all(
      ["co.nz", "192.168.0.1", "*.x.nz", "vote.mechane.live", "vote.x.localhost"].map((hostname) =>
        add(o, hostname, device.id),
      ),
    );
    const blocked = await add(o, `vote.${parent}`, device.id);

    expect(results.map((result) => result.errors?.[0]?.extensions)).toEqual([
      { code: "HOSTNAME_REFUSED", reason: "public_suffix" },
      { code: "HOSTNAME_REFUSED", reason: "ip_address" },
      { code: "HOSTNAME_REFUSED", reason: "wildcard" },
      { code: "HOSTNAME_REFUSED", reason: "mechane_owned_zone" },
      { code: "HOSTNAME_REFUSED", reason: "localhost" },
    ]);
    expect(blocked.errors?.[0]?.extensions?.code).toBe("HOSTNAME_BLOCKED");
    expect(await db.select().from(customDomains).where(eq(customDomains.userId, o.id))).toEqual([]);
  });
});

describe("binding", () => {
  it("unbinds the domain a Device already has, evicting and invalidating live addresses", async () => {
    const o = await owner();
    const audience = await createDevice(o.showId);
    const projector = await createDevice(o.showId);
    const vote = await addOrThrow(o, uniqueHostname("vote"), audience.id);
    const screen = await addOrThrow(o, uniqueHostname("screen"), projector.id);
    await makeLive(o, vote);
    const evictionsBefore = o.fake.evictions.length;
    const sequenceBefore = await stateSequence(o.showId);

    const rebound = await execute<{ bindCustomDomain: DomainResult }>(o.context, BIND, {
      id: vote.id,
      showId: o.showId,
      deviceId: projector.id,
    });

    expect(rebound.data?.bindCustomDomain.binding).toEqual({
      showId: o.showId,
      deviceId: projector.id,
    });
    expect((await row(screen.id))?.deviceId).toBeNull();
    expect(o.fake.evictions.slice(evictionsBefore)).toEqual([playerDomainCacheTags(vote.hostname)]);
    expect(await stateSequence(o.showId)).toBeGreaterThan(sequenceBefore);

    const listed = await execute<{
      customDomains: DomainResult[];
      unboundCustomDomains: { id: string }[];
    }>(o.context, LIST, { showId: o.showId });
    expect(listed.data?.customDomains.map((domain) => domain.id)).toEqual([vote.id]);
    expect(listed.data?.unboundCustomDomains.map((domain) => domain.id)).toEqual([screen.id]);
  });

  it("refuses to bind a Revoked domain or a retired Device", async () => {
    const o = await owner();
    const device = await createDevice(o.showId);
    const retired = await createDevice(o.showId, { retiredAt: new Date() });
    const domain = await addOrThrow(o, uniqueHostname("bind"), device.id);

    const toRetired = await execute(o.context, BIND, {
      id: domain.id,
      showId: o.showId,
      deviceId: retired.id,
    });
    await db
      .update(customDomains)
      .set({ status: "revoked" })
      .where(eq(customDomains.id, domain.id));
    const revoked = await execute(o.context, BIND, {
      id: domain.id,
      showId: o.showId,
      deviceId: device.id,
    });

    expect(toRetired.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    expect(revoked.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
  });

  it("unbinds the domain of a Device that publishing retires", async () => {
    const o = await owner();
    await seedShow.seed(o.showId);
    const unreferenced = await createDevice(o.showId);
    const domain = await addOrThrow(o, uniqueHostname("retired"), unreferenced.id);
    await makeLive(o, domain);
    const evictionsBefore = o.fake.evictions.length;

    await publishShowGraph(o.showId, { customDomainsProvider: o.fake });

    const stored = await row(domain.id);
    expect(stored?.deviceId).toBeNull();
    expect(stored?.status).toBe("live");
    expect(o.fake.evictions.slice(evictionsBefore)).toEqual([
      playerDomainCacheTags(domain.hostname),
    ]);
  });

  it("keeps a deleted Show's domains, unbound", async () => {
    const o = await owner();
    const device = await createDevice(o.showId);
    const domain = await addOrThrow(o, uniqueHostname("show-deleted"), device.id);

    await execute(o.context, `mutation ($id: ID!) { deleteShow(id: $id) }`, { id: o.showId });

    const stored = await row(domain.id);
    expect(stored).toBeDefined();
    expect(stored?.deviceShowId).toBeNull();
  });
});

describe("removeCustomDomain", () => {
  it("removes the domain from the provider and frees the hostname for someone else", async () => {
    const o = await owner();
    const other = await owner();
    const device = await createDevice(o.showId);
    const otherDevice = await createDevice(other.showId);
    const hostname = uniqueHostname("freed");
    const domain = await addOrThrow(o, hostname, device.id);
    await makeLive(o, domain);
    const sequenceBefore = await stateSequence(o.showId);

    const removed = await execute<{ removeCustomDomain: boolean }>(o.context, REMOVE, {
      id: domain.id,
    });

    expect(removed.data?.removeCustomDomain).toBe(true);
    expect(o.fake.count("removeProjectDomain", hostname)).toBe(1);
    expect(o.fake.evictions.at(-1)).toEqual(playerDomainCacheTags(hostname));
    expect(await stateSequence(o.showId)).toBeGreaterThan(sequenceBefore);
    expect(await row(domain.id)).toBeUndefined();

    const claimed = await addOrThrow(other, hostname, otherDevice.id);
    await makeLive(other, claimed);
  });
});

describe("checkCustomDomainNow", () => {
  it("checks a dormant domain straight away, and refuses again within 30 seconds", async () => {
    const o = await owner();
    const device = await createDevice(o.showId);
    const domain = await addOrThrow(o, uniqueHostname("check-now"), device.id);
    const stored = await row(domain.id);
    await db
      .update(customDomains)
      .set({ nextCheckDueAt: null, checkWindowStartedAt: new Date(Date.now() - 4 * 86_400_000) })
      .where(eq(customDomains.id, domain.id));
    o.fake.setProof(domain.hostname, [
      ownershipProofRecord(domain.hostname, stored!.proofToken).value,
    ]);

    const checked = await execute<{ checkCustomDomainNow: DomainResult }>(o.context, CHECK_NOW, {
      id: domain.id,
    });
    const again = await execute(o.context, CHECK_NOW, { id: domain.id });

    expect(checked.data?.checkCustomDomainNow.status).toBe("live");
    expect(again.errors?.[0]?.extensions?.code).toBe("RATE_LIMITED");
    expect(again.errors?.[0]?.message).toBe("Checked just now.");
  });

  it("refuses a domain the caller doesn't own", async () => {
    const o = await owner();
    const stranger = await owner();
    const device = await createDevice(o.showId);
    const domain = await addOrThrow(o, uniqueHostname("private"), device.id);

    const result = await execute(stranger.context, CHECK_NOW, { id: domain.id });

    expect(result.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
  });
});

// The Custom Domains slice (issues #817, #818, #822, #835): what a signed-in
// user does with their own Custom Domains. Every field checks that the user
// owns the domain, and the Show when binding. Binding applies straight away
// and is not part of the draft (ADR-0002).
//
// Limits: 10 domains per user, counting every status; 20 adds per user in a
// 24-hour window from the first add; Check now once per domain every 30 s.
import { and, eq, inArray, isNull, ne, type SQL } from "drizzle-orm";
import { GraphQLError } from "graphql";

import { customDomainsProvider as activeProvider } from "../custom-domains/active-provider";
import { coveringBlock } from "../custom-domains/blocks";
import { checkCustomDomain, WAITING_FOR_PROVIDER } from "../custom-domains/checker";
import {
  hostnameRefusalCode,
  isLiveCustomDomainStatus,
  isProvenCustomDomainStatus,
  normaliseHostname,
  PROVEN_CUSTOM_DOMAIN_STATUSES,
  type HostnameRefusalCode,
} from "../custom-domains/hostname";
import {
  evictResolvedHostnames,
  invalidateShowsForAddressChange,
} from "../custom-domains/live-address-effects";
import { generateProofToken, ownershipProofRecord } from "../custom-domains/records";
import { db } from "../db/client";
import type { Tx } from "../db/player-invalidation-outbox";
import { customDomains, devices, graphNodes, showGraphs, shows } from "../db/schema";
import { consumeRateLimit, type RateLimitBucket } from "../lib/rate-limit";
import type { GraphQLContext, Resolvers } from "./context";
import { requireUserId } from "./context";
import { findOwnShowOrThrow } from "./show";

export const CUSTOM_DOMAIN_CAP = 10;
const CUSTOM_DOMAIN_ADDS: RateLimitBucket = {
  name: "custom-domain-adds",
  limit: 20,
  windowSeconds: 24 * 60 * 60,
};
const CHECK_NOW_COOLDOWN: RateLimitBucket = {
  name: "custom-domain-check-now",
  limit: 1,
  windowSeconds: 30,
};

const REFUSAL_MESSAGES: Record<HostnameRefusalCode, (hostname: string) => string> = {
  invalid_hostname: () => "That doesn't look like a web address.",
  ip_address: () => "That's an IP address. Enter a domain name instead.",
  wildcard: () => "Wildcards aren't supported. Enter one exact address.",
  mechane_owned_zone: () => "That address already belongs to Mechanē.",
  public_suffix: (hostname) => `Nobody can own “${hostname}” on its own.`,
  localhost: () => "Addresses ending in .localhost only work in local development.",
};

type CustomDomainRow = typeof customDomains.$inferSelect;

interface CustomDomainView extends CustomDomainRow {
  showName: string | null;
  deviceName: string | null;
}

function providerOf(context: GraphQLContext) {
  return context.customDomains?.provider ?? activeProvider;
}

function notFound(): GraphQLError {
  return new GraphQLError("Custom domain not found.", { extensions: { code: "NOT_FOUND" } });
}

/** A user's domains with their bound Show and Device names. */
async function loadDomains(userId: string, filter?: SQL): Promise<CustomDomainView[]> {
  const rows = await db
    .select({ domain: customDomains, showName: shows.name })
    .from(customDomains)
    .leftJoin(shows, eq(shows.id, customDomains.deviceShowId))
    .where(and(eq(customDomains.userId, userId), filter))
    .orderBy(customDomains.addedAt);
  const bound = rows.flatMap(({ domain }) =>
    domain.deviceShowId && domain.deviceId ? [domain.deviceId] : [],
  );
  // A Device's name is its node's name in the Show's draft graph, which is
  // what Studio shows; a Device only the published graph still names falls
  // back to that.
  const names =
    bound.length === 0
      ? []
      : await db
          .select({ id: graphNodes.id, name: graphNodes.name, state: showGraphs.state })
          .from(graphNodes)
          .innerJoin(showGraphs, eq(showGraphs.id, graphNodes.graphId))
          .where(and(eq(graphNodes.kind, "device"), inArray(graphNodes.id, bound)));
  const deviceName = (id: string | null) =>
    names.find((node) => node.id === id && node.state === "draft")?.name ??
    names.find((node) => node.id === id)?.name ??
    null;
  return rows.map(({ domain, showName }) => ({
    ...domain,
    showName,
    deviceName: deviceName(domain.deviceId),
  }));
}

async function loadDomain(userId: string, id: string): Promise<CustomDomainView> {
  const [domain] = await loadDomains(userId, eq(customDomains.id, id));
  if (!domain) throw notFound();
  return domain;
}

/** The caller's own domain, or NOT_FOUND whether it is missing or someone else's. */
async function findOwnDomain(userId: string, id: string): Promise<CustomDomainRow> {
  const [domain] = await db
    .select()
    .from(customDomains)
    .where(and(eq(customDomains.id, id), eq(customDomains.userId, userId)));
  if (!domain) throw notFound();
  return domain;
}

/** A saved Device of an owned Show that publishing hasn't retired. */
async function findBindableDevice(userId: string, showId: string, deviceId: string) {
  await findOwnShowOrThrow(showId, userId);
  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.showId, showId), eq(devices.id, deviceId), isNull(devices.retiredAt)));
  if (!device) {
    throw new GraphQLError("Device not found. Save the Show first.", {
      extensions: { code: "NOT_FOUND" },
    });
  }
  return device;
}

/**
 * Binds `domain` to the Device, displacing any domain the Device already
 * has, inside `tx`. Returns the hostnames whose live address changed.
 */
async function bindInTransaction(
  tx: Tx,
  domain: Pick<CustomDomainRow, "id" | "hostname" | "status" | "deviceShowId">,
  showId: string,
  deviceId: string,
): Promise<string[]> {
  const displaced = await tx
    .update(customDomains)
    .set({ deviceShowId: null, deviceId: null })
    .where(
      and(
        eq(customDomains.deviceShowId, showId),
        eq(customDomains.deviceId, deviceId),
        ne(customDomains.id, domain.id),
      ),
    )
    .returning({ hostname: customDomains.hostname, status: customDomains.status });
  await tx
    .update(customDomains)
    .set({ deviceShowId: showId, deviceId })
    .where(eq(customDomains.id, domain.id));
  const changed = [
    ...displaced.filter((row) => isLiveCustomDomainStatus(row.status)).map((row) => row.hostname),
    ...(isLiveCustomDomainStatus(domain.status) ? [domain.hostname] : []),
  ];
  if (changed.length > 0) await invalidateShowsForAddressChange(tx, [showId, domain.deviceShowId]);
  return changed;
}

function refuseHostname(code: HostnameRefusalCode, hostname: string): never {
  throw new GraphQLError(REFUSAL_MESSAGES[code](hostname), {
    extensions: { code: "HOSTNAME_REFUSED", reason: code },
  });
}

export const typeDefs = /* GraphQL */ `
  "A DNS record the user creates at their DNS provider."
  type DnsRecord {
    "TXT, A or CNAME."
    type: String!
    name: String!
    value: String!
  }

  "The Show and Device a Custom Domain opens."
  type CustomDomainBinding {
    showId: ID!
    showName: String!
    deviceId: ID!
    deviceName: String!
  }

  "A hostname a user controls, which opens one of their Devices in the Player once it is live."
  type CustomDomain {
    id: ID!
    hostname: String!
    "unverified, connecting, securing, live, needs_attention or revoked."
    status: String!
    "The failing check and its remedy while the domain is stuck or needs attention."
    reason: String
    """
    The records to create: the _mechane TXT Ownership Proof, plus the A or
    CNAME record and any _vercel TXT challenge once the domain is Connecting.
    """
    records: [DnsRecord!]!
    "Pending for 72 hours without progress; only Check now checks it again."
    dormant: Boolean!
    "Proven, and waiting its turn to be added to the hosting provider."
    queued: Boolean!
    "Another Mechanē account holds this hostname proven."
    inUseByAnotherAccount: Boolean!
    "The Show and Device it opens, or null when it is not in use."
    binding: CustomDomainBinding
    revocationReason: String
    addedAt: String!
    provenAt: String
    wentLiveAt: String
    statusChangedAt: String!
    lastCheckedAt: String
  }

  type Query {
    "The signed-in user's Custom Domains, or only those bound to one of their Show's Devices."
    customDomains(showId: ID): [CustomDomain!]!
    "The signed-in user's Custom Domains bound to no Device, for bringing one to a Device."
    unboundCustomDomains: [CustomDomain!]!
  }

  type Mutation {
    """
    Adds a Custom Domain bound to a saved Device of one of the user's Shows.
    Refused with HOSTNAME_REFUSED (extensions.reason), HOSTNAME_BLOCKED,
    CUSTOM_DOMAIN_CAP_REACHED, or RATE_LIMITED (extensions.hoursLeft).
    """
    addCustomDomain(hostname: String!, showId: ID!, deviceId: ID!): CustomDomain!
    """
    Binds a domain to a saved Device straight away, outside the draft. A
    domain the Device already has is unbound. Revoked domains can't be bound.
    """
    bindCustomDomain(id: ID!, showId: ID!, deviceId: ID!): CustomDomain!
    unbindCustomDomain(id: ID!): CustomDomain!
    "Removes the domain from the hosting provider and deletes it, freeing the hostname."
    removeCustomDomain(id: ID!): Boolean!
    "Checks the domain now, dormant or not. RATE_LIMITED within 30 seconds of the last."
    checkCustomDomainNow(id: ID!): CustomDomain!
  }
`;

export const resolvers: Resolvers = {
  CustomDomain: {
    reason: (domain: CustomDomainView) => domain.statusReason,
    records: (domain: CustomDomainView) => {
      if (domain.status === "revoked") return [];
      const proof = ownershipProofRecord(domain.hostname, domain.proofToken);
      if (domain.status === "unverified" || !domain.dnsRecords) return [proof];
      return [...domain.dnsRecords.recommended, ...domain.dnsRecords.verification, proof];
    },
    dormant: (domain: CustomDomainView) =>
      !isLiveCustomDomainStatus(domain.status) &&
      domain.status !== "revoked" &&
      domain.nextCheckDueAt === null,
    queued: (domain: CustomDomainView) =>
      domain.status === "connecting" &&
      domain.providerAddedAt === null &&
      domain.statusReason === WAITING_FOR_PROVIDER,
    inUseByAnotherAccount: async (domain: CustomDomainView) => {
      if (isProvenCustomDomainStatus(domain.status)) return false;
      const [holder] = await db
        .select({ id: customDomains.id })
        .from(customDomains)
        .where(
          and(
            eq(customDomains.hostname, domain.hostname),
            ne(customDomains.userId, domain.userId),
            inArray(customDomains.status, [...PROVEN_CUSTOM_DOMAIN_STATUSES]),
          ),
        );
      return holder !== undefined;
    },
    binding: (domain: CustomDomainView) =>
      domain.deviceShowId && domain.deviceId
        ? {
            showId: domain.deviceShowId,
            showName: domain.showName ?? "",
            deviceId: domain.deviceId,
            deviceName: domain.deviceName ?? "Device",
          }
        : null,
    addedAt: (domain: CustomDomainView) => domain.addedAt.toISOString(),
    provenAt: (domain: CustomDomainView) => domain.provenAt?.toISOString() ?? null,
    wentLiveAt: (domain: CustomDomainView) => domain.wentLiveAt?.toISOString() ?? null,
    statusChangedAt: (domain: CustomDomainView) => domain.statusChangedAt.toISOString(),
    lastCheckedAt: (domain: CustomDomainView) => domain.lastCheckedAt?.toISOString() ?? null,
  },
  Query: {
    customDomains: async (_parent, { showId }: { showId?: string | null }, context) => {
      const userId = requireUserId(context);
      if (!showId) return loadDomains(userId);
      await findOwnShowOrThrow(showId, userId);
      return loadDomains(userId, eq(customDomains.deviceShowId, showId));
    },
    unboundCustomDomains: async (_parent, _args, context) => {
      const userId = requireUserId(context);
      return loadDomains(userId, isNull(customDomains.deviceId));
    },
  },
  Mutation: {
    addCustomDomain: async (
      _parent,
      args: { hostname: string; showId: string; deviceId: string },
      context,
    ) => {
      const userId = requireUserId(context);
      const provider = providerOf(context);
      await findBindableDevice(userId, args.showId, args.deviceId);

      // Forgive a pasted URL: keep only its host.
      const entered = args.hostname.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
      const bare = entered.replace(/[/?#].*$/, "");
      const refusal = hostnameRefusalCode(bare, { allowLocalhost: provider.allowLocalhost });
      if (refusal) refuseHostname(refusal, bare);
      const hostname = normaliseHostname(bare);
      if (hostname === null) refuseHostname("invalid_hostname", bare);

      if (await coveringBlock(hostname)) {
        throw new GraphQLError("Mechanē can't accept this address.", {
          extensions: { code: "HOSTNAME_BLOCKED" },
        });
      }
      const owned = await db
        .select({ hostname: customDomains.hostname })
        .from(customDomains)
        .where(eq(customDomains.userId, userId));
      if (owned.some((domain) => domain.hostname === hostname)) {
        throw new GraphQLError("You've already added this address.", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      if (owned.length >= CUSTOM_DOMAIN_CAP) {
        throw new GraphQLError(
          `You're using all ${CUSTOM_DOMAIN_CAP} custom domains. Remove one to add another.`,
          { extensions: { code: "CUSTOM_DOMAIN_CAP_REACHED" } },
        );
      }
      const { allowed, retryAfterSeconds } = await consumeRateLimit(CUSTOM_DOMAIN_ADDS, userId);
      if (!allowed) {
        const hoursLeft = Math.max(1, Math.ceil(retryAfterSeconds / 3600));
        throw new GraphQLError(
          `You've added ${CUSTOM_DOMAIN_ADDS.limit} domains today. Try again in ${hoursLeft} ${hoursLeft === 1 ? "hour" : "hours"}.`,
          { extensions: { code: "RATE_LIMITED", hoursLeft, retryAfterSeconds } },
        );
      }

      const now = new Date();
      const { id, changed } = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(customDomains)
          .values({
            userId,
            hostname,
            status: "unverified",
            proofToken: generateProofToken(),
            addedAt: now,
            statusChangedAt: now,
            checkWindowStartedAt: now,
            nextCheckDueAt: now,
          })
          .returning();
        const changed = await bindInTransaction(tx, inserted!, args.showId, args.deviceId);
        return { id: inserted!.id, changed };
      });
      await evictResolvedHostnames(provider, changed);
      return loadDomain(userId, id);
    },

    bindCustomDomain: async (
      _parent,
      args: { id: string; showId: string; deviceId: string },
      context,
    ) => {
      const userId = requireUserId(context);
      const domain = await findOwnDomain(userId, args.id);
      if (domain.status === "revoked") {
        throw new GraphQLError("A revoked domain can't be used.", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      await findBindableDevice(userId, args.showId, args.deviceId);
      const changed = await db.transaction((tx) =>
        bindInTransaction(tx, domain, args.showId, args.deviceId),
      );
      await evictResolvedHostnames(providerOf(context), changed);
      return loadDomain(userId, domain.id);
    },

    unbindCustomDomain: async (_parent, { id }: { id: string }, context) => {
      const userId = requireUserId(context);
      const domain = await findOwnDomain(userId, id);
      const live = isLiveCustomDomainStatus(domain.status) && domain.deviceShowId !== null;
      await db.transaction(async (tx) => {
        await tx
          .update(customDomains)
          .set({ deviceShowId: null, deviceId: null })
          .where(eq(customDomains.id, id));
        if (live) await invalidateShowsForAddressChange(tx, [domain.deviceShowId]);
      });
      if (live) await evictResolvedHostnames(providerOf(context), [domain.hostname]);
      return loadDomain(userId, id);
    },

    removeCustomDomain: async (_parent, { id }: { id: string }, context) => {
      const userId = requireUserId(context);
      const provider = providerOf(context);
      const domain = await findOwnDomain(userId, id);
      // Only the proven holder has the hostname on the Player project; an
      // unproven row may share its hostname with someone else's live domain.
      if (isProvenCustomDomainStatus(domain.status)) {
        await provider.removeProjectDomain(domain.hostname);
      }
      const live = isLiveCustomDomainStatus(domain.status) && domain.deviceShowId !== null;
      await db.transaction(async (tx) => {
        await tx.delete(customDomains).where(eq(customDomains.id, id));
        if (live) await invalidateShowsForAddressChange(tx, [domain.deviceShowId]);
      });
      if (isLiveCustomDomainStatus(domain.status)) {
        await evictResolvedHostnames(provider, [domain.hostname]);
      }
      return true;
    },

    checkCustomDomainNow: async (_parent, { id }: { id: string }, context) => {
      const userId = requireUserId(context);
      const domain = await findOwnDomain(userId, id);
      const { allowed } = await consumeRateLimit(CHECK_NOW_COOLDOWN, domain.id);
      if (!allowed) {
        throw new GraphQLError("Checked just now.", { extensions: { code: "RATE_LIMITED" } });
      }
      if (domain.status !== "revoked") {
        const now = new Date();
        // Check now wakes a dormant domain: its window of frequent checks
        // starts again.
        if (!isLiveCustomDomainStatus(domain.status)) {
          await db
            .update(customDomains)
            .set({ checkWindowStartedAt: now })
            .where(eq(customDomains.id, id));
        }
        await checkCustomDomain(id, now, providerOf(context), {
          budgetKey: context.customDomains?.budgetKey,
        });
      }
      return loadDomain(userId, id);
    },
  },
};

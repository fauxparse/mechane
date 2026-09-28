// Moderating Custom Domains (issues #823, #839): finding any user's domains,
// revoking them, and placing and lifting Blocked Hostnames. Backend only;
// every field is gated by the `customDomain` permission, never ownership.
//
// Revoking a hostname blocks it and marks every Custom Domain at or under it
// Revoked, removes each from the hosting provider as part of the call (the
// daily reconciliation is only the backstop), and emails each owner the
// reason. Lifting the block returns those domains to Unverified.
import { and, eq, inArray, isNull, like, or, type SQL } from "drizzle-orm";
import { GraphQLError } from "graphql";

import { customDomainsProvider as activeProvider } from "../custom-domains/active-provider";
import { coveringBlock } from "../custom-domains/blocks";
import {
  isLiveCustomDomainStatus,
  isProvenCustomDomainStatus,
  normaliseHostname,
} from "../custom-domains/hostname";
import {
  evictResolvedHostnames,
  invalidateShowsForAddressChange,
} from "../custom-domains/live-address-effects";
import { db } from "../db/client";
import { blockedHostnames, customDomains, graphNodes, showGraphs, shows, user } from "../db/schema";
import { renderActionEmail } from "../lib/action-email";
import { sendEmail } from "../lib/email";
import type { GraphQLContext, Resolvers } from "./context";
import { requirePermission } from "./context";

const studioOrigin = process.env.APP_STUDIO_URL ?? "http://localhost:5173";

type CustomDomainRow = typeof customDomains.$inferSelect;
type BlockRow = typeof blockedHostnames.$inferSelect;

interface AdminCustomDomainView extends CustomDomainRow {
  ownerName: string;
  ownerEmail: string;
  showName: string | null;
  deviceName: string | null;
}

function providerOf(context: GraphQLContext) {
  return context.customDomains?.provider ?? activeProvider;
}

function requiredHostname(value: string): string {
  const hostname = normaliseHostname(value);
  if (hostname === null) {
    throw new GraphQLError("Enter a hostname.", { extensions: { code: "BAD_USER_INPUT" } });
  }
  return hostname;
}

function requiredReason(value: string): string {
  const reason = value.trim();
  if (reason === "") {
    throw new GraphQLError("Give a reason; the owner sees it.", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return reason;
}

/**
 * The hostname itself and every hostname beneath it. Normalised hostnames
 * hold only letters, digits, hyphens and dots, so none is a LIKE wildcard.
 */
function atOrUnder(hostname: string): SQL | undefined {
  return or(eq(customDomains.hostname, hostname), like(customDomains.hostname, `%.${hostname}`));
}

async function loadAdminDomains(where: SQL | undefined): Promise<AdminCustomDomainView[]> {
  const rows = await db
    .select({
      domain: customDomains,
      ownerName: user.name,
      ownerEmail: user.email,
      showName: shows.name,
    })
    .from(customDomains)
    .innerJoin(user, eq(user.id, customDomains.userId))
    .leftJoin(shows, eq(shows.id, customDomains.deviceShowId))
    .where(where)
    .orderBy(customDomains.hostname, customDomains.addedAt);
  const deviceIds = rows.flatMap(({ domain }) => (domain.deviceId ? [domain.deviceId] : []));
  const names =
    deviceIds.length === 0
      ? []
      : await db
          .select({ id: graphNodes.id, name: graphNodes.name, state: showGraphs.state })
          .from(graphNodes)
          .innerJoin(showGraphs, eq(showGraphs.id, graphNodes.graphId))
          .where(and(eq(graphNodes.kind, "device"), inArray(graphNodes.id, deviceIds)));
  return rows.map(({ domain, ownerName, ownerEmail, showName }) => ({
    ...domain,
    ownerName,
    ownerEmail,
    showName,
    deviceName:
      names.find((node) => node.id === domain.deviceId && node.state === "draft")?.name ??
      names.find((node) => node.id === domain.deviceId)?.name ??
      null,
  }));
}

/** Places a block on exactly `hostname`, or returns the active one already there. */
async function placeBlock(hostname: string, reason: string, placedBy: string): Promise<BlockRow> {
  const [placed] = await db
    .insert(blockedHostnames)
    .values({ hostname, reason, placedBy })
    .onConflictDoNothing()
    .returning();
  if (placed) return placed;
  const [existing] = await db
    .select()
    .from(blockedHostnames)
    .where(and(eq(blockedHostnames.hostname, hostname), isNull(blockedHostnames.liftedAt)));
  return existing!;
}

async function emailRevokedOwner(
  domain: AdminCustomDomainView,
  reason: string,
  adminEmail: string,
): Promise<void> {
  const opened =
    domain.showName && domain.deviceName
      ? `${domain.showName} › ${domain.deviceName}`
      : domain.showName;
  const where = opened ? ` It opened ${opened}.` : "";
  const settingsUrl = domain.deviceShowId
    ? new URL(`/shows/${domain.deviceShowId}/settings`, studioOrigin).toString()
    : new URL("/", studioOrigin).toString();
  const email = await renderActionEmail({
    preview: `${domain.hostname} no longer opens in Mechanē`,
    heading: `We've revoked ${domain.hostname}`,
    message: `Mechanē has stopped serving ${domain.hostname}.${where} The reason: ${reason}`,
    actionLabel: "See your custom domains",
    actionUrl: settingsUrl,
    note: "If you think this is a mistake, reply to this email to reach the Mechanē admin who made the decision.",
  });
  await sendEmail({
    to: domain.ownerEmail,
    replyTo: adminEmail,
    subject: `${domain.hostname} has been revoked`,
    ...email,
  });
}

export const typeDefs = /* GraphQL */ `
  "A hostname, with everything beneath it, that Mechanē refuses to accept or serve."
  type BlockedHostname {
    id: ID!
    hostname: String!
    reason: String!
    placedBy: ID!
    placedAt: String!
    liftedBy: ID
    liftedAt: String
  }

  "Any user's Custom Domain, as moderation sees it."
  type AdminCustomDomain {
    id: ID!
    hostname: String!
    status: String!
    reason: String
    revocationReason: String
    ownerId: ID!
    ownerName: String!
    ownerEmail: String!
    binding: CustomDomainBinding
    addedAt: String!
    provenAt: String
    wentLiveAt: String
    statusChangedAt: String!
    "The active block covering this hostname, if any."
    block: BlockedHostname
  }

  type Query {
    """
    Custom Domains at or under a hostname, or owned by the user with an email
    address. Requires the customDomain:list permission.
    """
    adminCustomDomains(hostname: String, ownerEmail: String): [AdminCustomDomain!]!
    "The active block covering a hostname, if any. Requires customDomain:list."
    hostnameBlock(hostname: String!): BlockedHostname
  }

  type Mutation {
    """
    Blocks a hostname and revokes every Custom Domain at or under it, removing
    each from the hosting provider and emailing its owner the reason.
    Requires customDomain:revoke.
    """
    revokeCustomDomain(hostname: String!, reason: String!): [AdminCustomDomain!]!
    "Blocks a hostname and its subdomains, added or not. Requires customDomain:block."
    blockHostname(hostname: String!, reason: String!): BlockedHostname!
    """
    Lifts the block on a hostname, returning the Revoked domains beneath it to
    Unverified. Requires customDomain:unblock.
    """
    unblockHostname(hostname: String!): BlockedHostname!
  }
`;

const serializeBlock = {
  placedAt: (block: BlockRow) => block.placedAt.toISOString(),
  liftedAt: (block: BlockRow) => block.liftedAt?.toISOString() ?? null,
};

export const resolvers: Resolvers = {
  BlockedHostname: serializeBlock,
  AdminCustomDomain: {
    reason: (domain: AdminCustomDomainView) => domain.statusReason,
    ownerId: (domain: AdminCustomDomainView) => domain.userId,
    binding: (domain: AdminCustomDomainView) =>
      domain.deviceShowId && domain.deviceId
        ? {
            showId: domain.deviceShowId,
            showName: domain.showName ?? "",
            deviceId: domain.deviceId,
            deviceName: domain.deviceName ?? "Device",
          }
        : null,
    addedAt: (domain: AdminCustomDomainView) => domain.addedAt.toISOString(),
    provenAt: (domain: AdminCustomDomainView) => domain.provenAt?.toISOString() ?? null,
    wentLiveAt: (domain: AdminCustomDomainView) => domain.wentLiveAt?.toISOString() ?? null,
    statusChangedAt: (domain: AdminCustomDomainView) => domain.statusChangedAt.toISOString(),
    block: (domain: AdminCustomDomainView) => coveringBlock(domain.hostname),
  },
  Query: {
    adminCustomDomains: async (
      _parent,
      args: { hostname?: string | null; ownerEmail?: string | null },
      context,
    ) => {
      await requirePermission(context, { customDomain: ["list"] });
      const filters: (SQL | undefined)[] = [];
      if (args.hostname) filters.push(atOrUnder(requiredHostname(args.hostname)));
      if (args.ownerEmail) filters.push(eq(user.email, args.ownerEmail.trim().toLowerCase()));
      if (filters.length === 0) {
        throw new GraphQLError("Search by hostname or owner email.", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      return loadAdminDomains(and(...filters));
    },
    hostnameBlock: async (_parent, { hostname }: { hostname: string }, context) => {
      await requirePermission(context, { customDomain: ["list"] });
      return coveringBlock(requiredHostname(hostname));
    },
  },
  Mutation: {
    revokeCustomDomain: async (_parent, args: { hostname: string; reason: string }, context) => {
      const adminId = await requirePermission(context, { customDomain: ["revoke"] });
      const hostname = requiredHostname(args.hostname);
      const reason = requiredReason(args.reason);
      const provider = providerOf(context);
      await placeBlock(hostname, reason, adminId);

      const affected = (await loadAdminDomains(atOrUnder(hostname))).filter(
        (domain) => domain.status !== "revoked",
      );
      for (const domain of affected) {
        if (isProvenCustomDomainStatus(domain.status)) {
          await provider.removeProjectDomain(domain.hostname);
        }
      }
      await db.transaction(async (tx) => {
        if (affected.length > 0) {
          await tx
            .update(customDomains)
            .set({
              status: "revoked",
              revocationReason: reason,
              statusReason: null,
              statusChangedAt: new Date(),
              nextCheckDueAt: null,
              providerAddedAt: null,
              lastVerifiedAt: null,
            })
            .where(
              inArray(
                customDomains.id,
                affected.map((domain) => domain.id),
              ),
            );
        }
        await invalidateShowsForAddressChange(
          tx,
          affected
            .filter((domain) => isLiveCustomDomainStatus(domain.status))
            .map((domain) => domain.deviceShowId),
        );
      });
      await evictResolvedHostnames(provider, [
        hostname,
        ...affected.map((domain) => domain.hostname),
      ]);

      const adminEmail = context.user?.email ?? "";
      for (const domain of affected) await emailRevokedOwner(domain, reason, adminEmail);
      return loadAdminDomains(
        inArray(
          customDomains.id,
          affected.map((domain) => domain.id),
        ),
      );
    },

    blockHostname: async (_parent, args: { hostname: string; reason: string }, context) => {
      const adminId = await requirePermission(context, { customDomain: ["block"] });
      const hostname = requiredHostname(args.hostname);
      const block = await placeBlock(hostname, requiredReason(args.reason), adminId);
      // Every cached answer beneath the hostname carries its tag too.
      await evictResolvedHostnames(providerOf(context), [hostname]);
      return block;
    },

    unblockHostname: async (_parent, args: { hostname: string }, context) => {
      const adminId = await requirePermission(context, { customDomain: ["unblock"] });
      const hostname = requiredHostname(args.hostname);
      const now = new Date();
      return db.transaction(async (tx) => {
        const [lifted] = await tx
          .update(blockedHostnames)
          .set({ liftedBy: adminId, liftedAt: now })
          .where(and(eq(blockedHostnames.hostname, hostname), isNull(blockedHostnames.liftedAt)))
          .returning();
        if (!lifted) {
          throw new GraphQLError("That hostname isn't blocked.", {
            extensions: { code: "NOT_FOUND" },
          });
        }
        await tx
          .update(customDomains)
          .set({
            status: "unverified",
            statusReason: null,
            statusChangedAt: now,
            checkWindowStartedAt: now,
            nextCheckDueAt: now,
          })
          .where(and(atOrUnder(hostname), eq(customDomains.status, "revoked")));
        return lifted;
      });
    },
  },
};

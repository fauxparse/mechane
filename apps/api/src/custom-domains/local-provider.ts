// The local domains provider (issues #824, #832): development's stand-in for
// DNS, Vercel and the HTTPS check. Every check passes, so a domain added in
// Studio walks to Live on its own, unless `pnpm dev:domains` has stored an
// override for its hostname in `custom_domain_overrides`. Reading the table
// on every call is what keeps the dev server's checker and the script in
// agreement. Nothing is ever sent anywhere, so eviction does nothing.
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../db/client";
import { customDomainOverrides, customDomains, user } from "../db/schema";
import { PROVEN_CUSTOM_DOMAIN_STATUSES } from "./hostname";
import type { CustomDomainsProvider, DomainConfig, ProjectDomain } from "./provider";

const VERIFIED: ProjectDomain = { verified: true, verification: [] };

async function overrideFor(hostname: string) {
  const [override] = await db
    .select()
    .from(customDomainOverrides)
    .where(eq(customDomainOverrides.hostname, hostname));
  return override ?? null;
}

export const localCustomDomainsProvider: CustomDomainsProvider = {
  name: "local",
  allowLocalhost: true,

  async lookupOwnershipProof(hostname) {
    const override = await overrideFor(hostname);
    // Every domain's own token counts as published, so whoever adds the
    // hostname proves it, unless `proof` withholds them all or `--keep`
    // names the one user whose proof stays.
    const keep = override?.withholdProof ? override.keepProofForEmail : undefined;
    if (keep === null) return [];
    const rows = await db
      .select({ token: customDomains.proofToken })
      .from(customDomains)
      .innerJoin(user, eq(user.id, customDomains.userId))
      .where(
        and(
          eq(customDomains.hostname, hostname),
          keep === undefined ? undefined : eq(user.email, keep),
        ),
      );
    return rows.map((row) => row.token);
  },

  async addProjectDomain() {
    return { kind: "added", domain: VERIFIED };
  },

  async getProjectDomain() {
    return VERIFIED;
  },

  async getDomainConfig(hostname): Promise<DomainConfig> {
    const override = await overrideFor(hostname);
    return {
      misconfigured: override?.misconfigured ?? false,
      recommended: [{ type: "CNAME", name: hostname, value: "player.localhost." }],
    };
  },

  async verifyProjectDomain() {
    return VERIFIED;
  },

  async removeProjectDomain() {},

  // The local "project" holds exactly the domains Mechanē has proven, so
  // reconciliation finds nothing to remove.
  async listProjectDomains() {
    const rows = await db
      .select({ hostname: customDomains.hostname })
      .from(customDomains)
      .where(inArray(customDomains.status, [...PROVEN_CUSTOM_DOMAIN_STATUSES]));
    return rows.map((row) => row.hostname);
  },

  async checkHttps(hostname) {
    const override = await overrideFor(hostname);
    return override?.failHttps
      ? { ok: false, reason: "The certificate isn't valid (simulated by pnpm dev:domains)." }
      : { ok: true };
  },

  async evictResolveCache() {},
};

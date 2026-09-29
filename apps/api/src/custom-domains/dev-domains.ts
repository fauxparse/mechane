// `pnpm dev:domains <hostname> proof|point|cert|drift|clear` (issues #824,
// #832): overrides for the local domains provider, so a developer can walk a
// Custom Domain through every status without real DNS. Overrides live in
// `custom_domain_overrides`, which the local provider reads on every check;
// the dev server's checker picks a change up on its next pass.
import { parseArgs } from "node:util";

import { and, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "../db/client";
import { customDomainOverrides, customDomains } from "../db/schema";
import { normaliseHostname, PROVEN_CUSTOM_DOMAIN_STATUSES } from "./hostname";

export const DEV_DOMAINS_USAGE = `Usage: pnpm dev:domains <hostname> <command> [options]

Commands:
  proof   Withhold the Ownership Proof.
            --keep <email>      keep only that user's proof (a contested takeover)
            --since <duration>  backdate when the proof went missing, e.g. 8d, 36h, 90m
  point   Report the hostname's DNS as misconfigured.
  cert    Fail the HTTPS check.
  drift   Both point and cert, for a Live domain.
  clear   Remove every override for the hostname.`;

const COMMANDS = ["proof", "point", "cert", "drift", "clear"] as const;
type DevDomainsCommand = (typeof COMMANDS)[number];

const DURATION_UNITS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };

function parseDuration(value: string): number {
  const match = /^(\d+)([mhd])$/.exec(value);
  if (!match) throw new Error(`--since takes a duration like 8d, 36h or 90m, not "${value}".`);
  return Number(match[1]) * DURATION_UNITS[match[2]!]!;
}

async function upsertOverride(
  hostname: string,
  values: Partial<typeof customDomainOverrides.$inferInsert>,
): Promise<void> {
  await db
    .insert(customDomainOverrides)
    .values({ hostname, ...values })
    .onConflictDoUpdate({
      target: customDomainOverrides.hostname,
      set: { ...values, updatedAt: sql`now()` },
    });
}

/** Applies one `dev:domains` invocation and returns what it did. */
export async function runDevDomains(argv: readonly string[]): Promise<string> {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: { keep: { type: "string" }, since: { type: "string" } },
  });
  const [rawHostname, command] = positionals;
  if (!rawHostname || !command || !COMMANDS.includes(command as DevDomainsCommand)) {
    throw new Error(DEV_DOMAINS_USAGE);
  }
  const hostname = normaliseHostname(rawHostname);
  if (hostname === null) throw new Error(`"${rawHostname}" is not a hostname.`);

  const message = await applyOverride(hostname, command as DevDomainsCommand, values);
  // Make the hostname's domains due now, so the dev server's next pass sees
  // the change instead of waiting out a Live domain's daily recheck.
  await db
    .update(customDomains)
    .set({ nextCheckDueAt: new Date() })
    .where(and(eq(customDomains.hostname, hostname), ne(customDomains.status, "revoked")));
  return message;
}

async function applyOverride(
  hostname: string,
  command: DevDomainsCommand,
  values: { keep?: string; since?: string },
): Promise<string> {
  switch (command) {
    case "proof": {
      await upsertOverride(hostname, {
        withholdProof: true,
        keepProofForEmail: values.keep ?? null,
      });
      if (values.since !== undefined) {
        const missingSince = new Date(Date.now() - parseDuration(values.since));
        // The checker keeps the earliest time it saw the proof missing, so
        // backdating a proven domain's clock makes the 7-day lapse reachable.
        await db
          .update(customDomains)
          .set({ proofWentMissingAt: missingSince })
          .where(
            and(
              eq(customDomains.hostname, hostname),
              inArray(customDomains.status, [...PROVEN_CUSTOM_DOMAIN_STATUSES]),
              or(
                isNull(customDomains.proofWentMissingAt),
                gt(customDomains.proofWentMissingAt, missingSince),
              ),
            ),
          );
      }
      return values.keep
        ? `${hostname}: withholding every Ownership Proof except ${values.keep}'s.`
        : `${hostname}: withholding the Ownership Proof.`;
    }
    case "point":
      await upsertOverride(hostname, { misconfigured: true });
      return `${hostname}: the hosting provider now reports it misconfigured.`;
    case "cert":
      await upsertOverride(hostname, { failHttps: true });
      return `${hostname}: the HTTPS check now fails.`;
    case "drift":
      await upsertOverride(hostname, { misconfigured: true, failHttps: true });
      return `${hostname}: misconfigured, and the HTTPS check fails.`;
    case "clear":
      await db.delete(customDomainOverrides).where(eq(customDomainOverrides.hostname, hostname));
      return `${hostname}: every override cleared.`;
  }
}

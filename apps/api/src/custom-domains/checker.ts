// The Custom Domain checker (issues #817, #822, #823, #833): Mechanē's
// status machine, driven only through the domains provider seam. Mechanē
// owns every status; the provider's `verified` and `misconfigured` flags
// are inputs.
//
//   Unverified      → Connecting       this domain's proof is found and no block covers it
//   Connecting      → Securing         `verified && !misconfigured`
//   Securing        → Live             Mechanē's HTTPS check passes
//   Live            → Needs attention  a recheck fails (proof, flags or HTTPS)
//   Needs attention → Live             rechecks pass
//   Needs attention → Unverified       the proof has been missing for 7 days (a lapse)
//
// Provider writes are budgeted globally (80 adds and 40 verifies an hour)
// through the shared limiter. Proven domains beyond the budget wait in a
// queue ordered by when they were proven.
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, ne, sql } from "drizzle-orm";

import { db } from "../db/client";
import type { Tx } from "../db/player-invalidation-outbox";
import { customDomains } from "../db/schema";
import { consumeRateLimit, type RateLimitBucket } from "../lib/rate-limit";
import { coveringBlock } from "./blocks";
import { isLiveCustomDomainStatus, PROVEN_CUSTOM_DOMAIN_STATUSES } from "./hostname";
import { evictResolvedHostnames, invalidateShowsForAddressChange } from "./live-address-effects";
import {
  ProviderRateLimitedError,
  type CustomDomainDnsRecords,
  type CustomDomainsProvider,
} from "./provider";
import { ownershipProofRecord } from "./records";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Pending domains are checked every minute this long into their window… */
const FREQUENT_CHECKS_FOR = 10 * MINUTE;
/** …then every 15 minutes until the window ends and they go dormant. */
const CHECK_WINDOW = 72 * HOUR;
/** A domain whose proof has been missing this long lapses. */
export const PROOF_LAPSE_AFTER = 7 * DAY;
/** Verify runs at most once per domain in this interval. */
export const VERIFY_INTERVAL = 5 * MINUTE;

export const PROVIDER_ADD_BUDGET: RateLimitBucket = {
  name: "custom-domains-provider-adds",
  limit: 80,
  windowSeconds: 3600,
};
export const PROVIDER_VERIFY_BUDGET: RateLimitBucket = {
  name: "custom-domains-provider-verifies",
  limit: 40,
  windowSeconds: 3600,
};

/** The reason a queued domain shows while it waits for the provider budget. */
export const WAITING_FOR_PROVIDER =
  "Waiting our turn with the hosting provider — nothing for you to do.";
export const CONTESTED = "In use by another Mechanē account.";
const BLOCKED = "Mechanē can't serve this address.";
const PROOF_MISSING = (hostname: string) =>
  `Add the TXT record at _mechane.${hostname} to prove the address is yours.`;
const DISPLACED =
  "Another Mechanē account proved this address while your proof record was missing. Put your record back to reclaim it.";
const LAPSED =
  "Your proof record was missing for 7 days, so the address was disconnected. Put it back to reconnect.";
const IN_USE_ELSEWHERE =
  "This address is attached to another hosting account. Remove it there, then check again.";
const MISCONFIGURED = (hostname: string) =>
  `The DNS record for ${hostname} doesn't point at Mechanē yet.`;
const CHALLENGE =
  "The hosting provider needs the _vercel TXT record before it will serve this address.";
const PROOF_GONE =
  "The _mechane proof record has gone. Put it back within 7 days, or the address stops working.";
const NOT_SERVED = "The hosting provider no longer serves this address.";
const DRIFTED = (hostname: string) => `The DNS record for ${hostname} no longer points at Mechanē.`;

type CustomDomainRow = typeof customDomains.$inferSelect;
type CustomDomainPatch = Partial<CustomDomainRow>;

export interface CheckerOptions {
  /** Key for the global provider budget. Tests isolate theirs. */
  budgetKey?: string;
  /** Restricts a pass to these hostnames. The deployed checker checks every domain. */
  hostnames?: readonly string[];
  /** Wall-clock time a pass may spend before it stops. */
  budgetMs?: number;
}

interface PassState {
  readonly provider: CustomDomainsProvider;
  readonly now: Date;
  readonly budgetKey: string;
  readonly hostnames: readonly string[] | undefined;
  /** Set when the provider refuses a write; later writes in the pass wait. */
  writesBlockedUntil: Date | null;
  readonly evictions: string[];
}

export interface CheckPassResult {
  checked: number;
  budgetExceeded: boolean;
}

function pendingSchedule(row: CustomDomainRow, now: Date, every: number): Date | null {
  const age = now.getTime() - row.checkWindowStartedAt.getTime();
  if (age >= CHECK_WINDOW) return null;
  return new Date(now.getTime() + (age < FREQUENT_CHECKS_FOR ? MINUTE : every));
}

/** When a domain in `row`'s state is next due, or null while dormant. */
function nextCheckDue(row: CustomDomainRow, now: Date): Date | null {
  switch (row.status) {
    case "revoked":
      return null;
    case "live":
      return new Date(now.getTime() + DAY);
    case "needs_attention":
      return new Date(now.getTime() + 15 * MINUTE);
    default:
      return pendingSchedule(
        row,
        now,
        row.statusReason === WAITING_FOR_PROVIDER ? MINUTE : 15 * MINUTE,
      );
  }
}

function hostnameScope(state: Pick<PassState, "hostnames">) {
  return state.hostnames ? inArray(customDomains.hostname, [...state.hostnames]) : undefined;
}

/**
 * Writes a domain's new state with its schedule. When it enters or leaves
 * the live set, its Show is invalidated in the same transaction and its
 * hostname queued for eviction.
 */
async function saveDomain(
  state: PassState,
  row: CustomDomainRow,
  patch: CustomDomainPatch,
  options: { tx?: Tx; nextCheckDueAt?: Date | null } = {},
): Promise<CustomDomainRow> {
  const merged: CustomDomainRow = { ...row, ...patch };
  const next: CustomDomainPatch = {
    ...patch,
    lastCheckedAt: state.now,
    ...(merged.status === row.status ? {} : { statusChangedAt: state.now }),
  };
  next.nextCheckDueAt =
    options.nextCheckDueAt === undefined
      ? nextCheckDue({ ...merged, ...next }, state.now)
      : options.nextCheckDueAt;
  const liveSetChanged =
    isLiveCustomDomainStatus(row.status) !== isLiveCustomDomainStatus(merged.status);

  const write = async (tx: Tx) => {
    const [saved] = await tx
      .update(customDomains)
      .set(next)
      .where(eq(customDomains.id, row.id))
      .returning();
    if (liveSetChanged) await invalidateShowsForAddressChange(tx, [row.deviceShowId]);
    return saved!;
  };
  const saved = options.tx ? await write(options.tx) : await db.transaction(write);
  if (liveSetChanged) state.evictions.push(row.hostname);
  return saved;
}

async function proofPresent(
  provider: CustomDomainsProvider,
  row: Pick<CustomDomainRow, "hostname" | "proofToken">,
  published?: readonly string[],
): Promise<boolean> {
  const values = published ?? (await provider.lookupOwnershipProof(row.hostname));
  return values.includes(ownershipProofRecord(row.hostname, row.proofToken).value);
}

async function consumeBudget(state: PassState, bucket: RateLimitBucket): Promise<boolean> {
  return (await consumeRateLimit(bucket, state.budgetKey)).allowed;
}

/** Unverified: look for this domain's proof, and contest a holder if there is one. */
async function checkUnverified(state: PassState, row: CustomDomainRow): Promise<CustomDomainRow> {
  if (await coveringBlock(row.hostname)) return saveDomain(state, row, { statusReason: BLOCKED });

  const published = await state.provider.lookupOwnershipProof(row.hostname);
  if (!(await proofPresent(state.provider, row, published))) {
    return saveDomain(state, row, { statusReason: PROOF_MISSING(row.hostname) });
  }

  const [holder] = await db
    .select()
    .from(customDomains)
    .where(
      and(
        eq(customDomains.hostname, row.hostname),
        ne(customDomains.id, row.id),
        inArray(customDomains.status, [...PROVEN_CUSTOM_DOMAIN_STATUSES]),
      ),
    );
  // Both parties control the DNS while both proofs are present, and the
  // holder keeps the hostname.
  if (holder && (await proofPresent(state.provider, holder, published))) {
    return saveDomain(state, row, { statusReason: CONTESTED });
  }

  return db.transaction(async (tx) => {
    // A holder whose proof is absent is displaced. The hostname stays on the
    // Player project, so the challenger takes it over where it stands.
    if (holder) {
      await saveDomain(
        state,
        holder,
        {
          status: "unverified",
          statusReason: DISPLACED,
          provenAt: null,
          providerAddedAt: null,
          lastVerifiedAt: null,
          proofWentMissingAt: null,
          checkWindowStartedAt: state.now,
        },
        { tx },
      );
    }
    return saveDomain(
      state,
      row,
      {
        status: "connecting",
        statusReason: holder?.providerAddedAt ? null : WAITING_FOR_PROVIDER,
        provenAt: state.now,
        providerAddedAt: holder?.providerAddedAt ?? null,
        dnsRecords: holder?.dnsRecords ?? null,
        proofWentMissingAt: null,
        checkWindowStartedAt: state.now,
      },
      { tx, nextCheckDueAt: state.now },
    );
  });
}

/** A queued Connecting domain: add it to the Player project if the budget allows. */
async function addToProvider(state: PassState, row: CustomDomainRow): Promise<CustomDomainRow> {
  if (state.writesBlockedUntil && state.writesBlockedUntil > state.now) {
    return saveDomain(
      state,
      row,
      { statusReason: WAITING_FOR_PROVIDER },
      { nextCheckDueAt: state.writesBlockedUntil },
    );
  }
  if (!(await consumeBudget(state, PROVIDER_ADD_BUDGET))) {
    return saveDomain(state, row, { statusReason: WAITING_FOR_PROVIDER });
  }
  try {
    const added = await state.provider.addProjectDomain(row.hostname);
    if (added.kind === "in_use_elsewhere") {
      return saveDomain(state, row, { statusReason: IN_USE_ELSEWHERE });
    }
    return checkConnecting(
      state,
      await saveDomain(state, row, {
        providerAddedAt: state.now,
        statusReason: null,
        dnsRecords: { recommended: [], verification: added.domain.verification },
      }),
    );
  } catch (error) {
    if (!(error instanceof ProviderRateLimitedError)) throw error;
    state.writesBlockedUntil = error.retryAt;
    return saveDomain(
      state,
      row,
      { statusReason: WAITING_FOR_PROVIDER },
      { nextCheckDueAt: error.retryAt },
    );
  }
}

/** Connecting and in the project: wait for the provider's flags. */
async function checkConnecting(state: PassState, row: CustomDomainRow): Promise<CustomDomainRow> {
  let domain = await state.provider.getProjectDomain(row.hostname);
  if (!domain) {
    return saveDomain(
      state,
      row,
      { providerAddedAt: null, statusReason: WAITING_FOR_PROVIDER },
      { nextCheckDueAt: state.now },
    );
  }
  const verifyDue =
    !row.lastVerifiedAt || state.now.getTime() - row.lastVerifiedAt.getTime() >= VERIFY_INTERVAL;
  let lastVerifiedAt = row.lastVerifiedAt;
  let blockedUntil: Date | null = null;
  if (
    domain.verification.length > 0 &&
    verifyDue &&
    !(state.writesBlockedUntil && state.writesBlockedUntil > state.now) &&
    (await consumeBudget(state, PROVIDER_VERIFY_BUDGET))
  ) {
    try {
      domain = await state.provider.verifyProjectDomain(row.hostname);
      lastVerifiedAt = state.now;
    } catch (error) {
      if (!(error instanceof ProviderRateLimitedError)) throw error;
      state.writesBlockedUntil = error.retryAt;
      blockedUntil = error.retryAt;
    }
  }
  const config = await state.provider.getDomainConfig(row.hostname);
  const dnsRecords: CustomDomainDnsRecords = {
    recommended: config.recommended,
    verification: domain.verification,
  };

  if (domain.verified && !config.misconfigured) {
    return checkSecuring(
      state,
      await saveDomain(state, row, {
        status: "securing",
        statusReason: null,
        dnsRecords,
        lastVerifiedAt,
      }),
    );
  }
  return saveDomain(
    state,
    row,
    {
      statusReason: domain.verified ? MISCONFIGURED(row.hostname) : CHALLENGE,
      dnsRecords,
      lastVerifiedAt,
    },
    blockedUntil ? { nextCheckDueAt: blockedUntil } : {},
  );
}

/** Securing: live once Mechanē's own HTTPS check passes. */
async function checkSecuring(state: PassState, row: CustomDomainRow): Promise<CustomDomainRow> {
  const https = await state.provider.checkHttps(row.hostname);
  if (!https.ok) return saveDomain(state, row, { statusReason: https.reason });
  return saveDomain(state, row, { status: "live", statusReason: null, wentLiveAt: state.now });
}

/** Live and Needs attention: every check again, and the 7-day lapse. */
async function recheckLive(state: PassState, row: CustomDomainRow): Promise<CustomDomainRow> {
  const proofOk = await proofPresent(state.provider, row);
  const proofWentMissingAt = proofOk ? null : (row.proofWentMissingAt ?? state.now);

  if (
    proofWentMissingAt !== null &&
    row.status === "needs_attention" &&
    state.now.getTime() - proofWentMissingAt.getTime() >= PROOF_LAPSE_AFTER
  ) {
    await state.provider.removeProjectDomain(row.hostname);
    return saveDomain(state, row, {
      status: "unverified",
      statusReason: LAPSED,
      provenAt: null,
      providerAddedAt: null,
      lastVerifiedAt: null,
      proofWentMissingAt: null,
      checkWindowStartedAt: state.now,
    });
  }

  const domain = await state.provider.getProjectDomain(row.hostname);
  const config = await state.provider.getDomainConfig(row.hostname);
  const https = await state.provider.checkHttps(row.hostname);
  const reason = !proofOk
    ? PROOF_GONE
    : !domain || !domain.verified
      ? NOT_SERVED
      : config.misconfigured
        ? DRIFTED(row.hostname)
        : !https.ok
          ? https.reason
          : null;
  const dnsRecords: CustomDomainDnsRecords = {
    recommended: config.recommended,
    verification: domain?.verification ?? [],
  };
  return saveDomain(state, row, {
    status: reason === null ? "live" : "needs_attention",
    statusReason: reason,
    proofWentMissingAt,
    dnsRecords,
  });
}

async function isHeadOfQueue(state: PassState, row: CustomDomainRow): Promise<boolean> {
  const [earlier] = await db
    .select({ id: customDomains.id })
    .from(customDomains)
    .where(
      and(
        eq(customDomains.status, "connecting"),
        isNull(customDomains.providerAddedAt),
        row.provenAt ? lt(customDomains.provenAt, row.provenAt) : undefined,
        hostnameScope(state),
      ),
    )
    .limit(1);
  return !earlier;
}

async function stepDomain(state: PassState, row: CustomDomainRow): Promise<CustomDomainRow> {
  switch (row.status) {
    case "unverified": {
      const checked = await checkUnverified(state, row);
      // A newly proven domain joins the queue behind every earlier one; one
      // that took over a hostname already on the project carries straight on.
      return checked.status === "connecting" ? stepDomain(state, checked) : checked;
    }
    case "connecting":
      if (row.providerAddedAt !== null) return checkConnecting(state, row);
      return (await isHeadOfQueue(state, row)) ? addToProvider(state, row) : row;
    case "securing":
      return checkSecuring(state, row);
    case "live":
    case "needs_attention":
      return recheckLive(state, row);
    case "revoked":
      return row;
  }
}

function passState(now: Date, provider: CustomDomainsProvider, options: CheckerOptions): PassState {
  return {
    provider,
    now,
    budgetKey: options.budgetKey ?? "global",
    hostnames: options.hostnames,
    writesBlockedUntil: null,
    evictions: [],
  };
}

/**
 * Checks one domain straight away, dormant or not: the per-domain step of a
 * pass, which Check now also runs. Returns the domain as it now stands.
 */
export async function checkCustomDomain(
  id: string,
  now: Date,
  provider: CustomDomainsProvider,
  options: CheckerOptions = {},
): Promise<CustomDomainRow | null> {
  const [row] = await db.select().from(customDomains).where(eq(customDomains.id, id));
  if (!row) return null;
  const state = passState(now, provider, options);
  const checked = await stepDomain(state, row);
  await evictResolvedHostnames(provider, state.evictions);
  return checked;
}

/**
 * One checker pass: every domain whose next check is due, queued domains
 * first in the order they were proven, until `budgetMs` of wall-clock time
 * has gone.
 */
export async function runCustomDomainChecks(
  now: Date,
  provider: CustomDomainsProvider,
  options: CheckerOptions = {},
): Promise<CheckPassResult> {
  const state = passState(now, provider, options);
  const budgetMs = options.budgetMs ?? 5_000;
  const startedAt = performance.now();
  const due = await db
    .select()
    .from(customDomains)
    .where(
      and(
        isNotNull(customDomains.nextCheckDueAt),
        lte(customDomains.nextCheckDueAt, now),
        ne(customDomains.status, "revoked"),
        hostnameScope(state),
      ),
    )
    .orderBy(
      // Queued domains (Connecting, not yet on the project) first, oldest
      // proof first, so the budget serves them in the order they were proven.
      sql`case when ${customDomains.status} = 'connecting' and ${customDomains.providerAddedAt} is null then 0 else 1 end`,
      asc(customDomains.provenAt),
      asc(customDomains.nextCheckDueAt),
    )
    .limit(200);

  let checked = 0;
  let budgetExceeded = false;
  try {
    for (const row of due) {
      if (performance.now() - startedAt >= budgetMs) {
        budgetExceeded = true;
        break;
      }
      await stepDomain(state, row);
      checked += 1;
    }
  } finally {
    await evictResolvedHostnames(provider, state.evictions);
  }
  return { checked, budgetExceeded };
}

/** First-party hostnames on the Player project that reconciliation never removes. */
export function reservedProjectHosts(env: Record<string, string | undefined>): string[] {
  return (env.CUSTOM_DOMAINS_RESERVED_PROJECT_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Removes every hostname on the Player project that no proven, non-Revoked
 * Custom Domain accounts for, sparing the reserved first-party hosts. This
 * is the backstop for revocations, lapses and deleted accounts.
 */
export async function reconcileProjectDomains(
  provider: CustomDomainsProvider,
  reserved: readonly string[],
): Promise<string[]> {
  const listed = await provider.listProjectDomains();
  const proven = await db
    .select({ hostname: customDomains.hostname })
    .from(customDomains)
    .where(
      and(
        inArray(customDomains.status, [...PROVEN_CUSTOM_DOMAIN_STATUSES]),
        inArray(customDomains.hostname, [...listed]),
      ),
    );
  const keep = new Set([...reserved, ...proven.map((row) => row.hostname)]);
  const orphans = listed.filter((hostname) => !keep.has(hostname));
  for (const hostname of orphans) await provider.removeProjectDomain(hostname);
  return orphans;
}

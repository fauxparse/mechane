// An in-memory domains provider for tests (issue #832). Every fact the
// checker branches on can be scripted per hostname, every call is recorded
// for assertions, and the clock is the test's, so a rate limit's retry time
// and the checker's schedule move only when the test says so.
import {
  ProviderRateLimitedError,
  type CustomDomainsProvider,
  type DnsRecord,
  type DomainConfig,
  type HttpsCheckResult,
  type ProjectDomain,
} from "./provider";

export interface FakeClock {
  now(): Date;
  advance(milliseconds: number): Date;
  set(date: Date): void;
}

export function createFakeClock(start = new Date("2026-10-01T00:00:00Z")): FakeClock {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance(milliseconds) {
      current += milliseconds;
      return new Date(current);
    },
    set(date) {
      current = date.getTime();
    },
  };
}

export type FakeProviderCall =
  | "lookupOwnershipProof"
  | "addProjectDomain"
  | "getProjectDomain"
  | "getDomainConfig"
  | "verifyProjectDomain"
  | "removeProjectDomain"
  | "listProjectDomains"
  | "checkHttps";

export interface FakeCustomDomainsProvider extends CustomDomainsProvider {
  readonly clock: FakeClock;
  /** Every call in order, with its hostname (null for `listProjectDomains`). */
  readonly calls: { method: FakeProviderCall; hostname: string | null }[];
  /** Every eviction's tags, in order. */
  readonly evictions: (readonly string[])[];
  /** Hostnames currently on the fake Player project. */
  readonly projectDomains: Set<string>;

  /** Publishes these TXT values at `_mechane.<hostname>`, replacing any. */
  setProof(hostname: string, tokens: readonly string[]): void;
  /** Makes adds of this hostname fail as held by another hosting account. */
  setInUseElsewhere(hostname: string, inUse: boolean): void;
  /** Leaves an outstanding challenge until `verifyProjectDomain` is allowed to clear it. */
  setChallenge(hostname: string, challenge: DnsRecord | null): void;
  /** Whether the next verify clears the hostname's challenge. */
  setVerifySucceeds(hostname: string, succeeds: boolean): void;
  setMisconfigured(hostname: string, misconfigured: boolean): void;
  setRecommended(hostname: string, records: readonly DnsRecord[]): void;
  setHttpsFailure(hostname: string, reason: string | null): void;
  /** Refuses adds and verifies with `rate_limit_exceeded` until `retryAt`. */
  rateLimitUntil(retryAt: Date | null): void;
  /** How many times `method` was called, optionally for one hostname. */
  count(method: FakeProviderCall, hostname?: string): number;
}

export function createFakeCustomDomainsProvider(
  options: { allowLocalhost?: boolean; clock?: FakeClock } = {},
): FakeCustomDomainsProvider {
  const clock = options.clock ?? createFakeClock();
  const calls: FakeCustomDomainsProvider["calls"] = [];
  const evictions: (readonly string[])[] = [];
  const projectDomains = new Set<string>();
  const proofs = new Map<string, readonly string[]>();
  const inUseElsewhere = new Set<string>();
  const challenges = new Map<string, DnsRecord>();
  const verifyFails = new Set<string>();
  const misconfigured = new Set<string>();
  const recommended = new Map<string, readonly DnsRecord[]>();
  const httpsFailures = new Map<string, string>();
  let rateLimitedUntil: Date | null = null;

  function record(method: FakeProviderCall, hostname: string | null): void {
    calls.push({ method, hostname });
  }

  function assertNotRateLimited(): void {
    if (rateLimitedUntil && clock.now() < rateLimitedUntil) {
      throw new ProviderRateLimitedError(rateLimitedUntil);
    }
  }

  function projectDomain(hostname: string): ProjectDomain {
    const challenge = challenges.get(hostname);
    return challenge
      ? { verified: false, verification: [challenge] }
      : { verified: true, verification: [] };
  }

  return {
    name: "fake",
    allowLocalhost: options.allowLocalhost ?? false,
    clock,
    calls,
    evictions,
    projectDomains,

    async lookupOwnershipProof(hostname) {
      record("lookupOwnershipProof", hostname);
      return proofs.get(hostname) ?? [];
    },

    async addProjectDomain(hostname) {
      record("addProjectDomain", hostname);
      assertNotRateLimited();
      if (inUseElsewhere.has(hostname)) return { kind: "in_use_elsewhere" };
      projectDomains.add(hostname);
      return { kind: "added", domain: projectDomain(hostname) };
    },

    async getProjectDomain(hostname) {
      record("getProjectDomain", hostname);
      return projectDomains.has(hostname) ? projectDomain(hostname) : null;
    },

    async getDomainConfig(hostname): Promise<DomainConfig> {
      record("getDomainConfig", hostname);
      return {
        misconfigured: misconfigured.has(hostname),
        recommended: recommended.get(hostname) ?? [
          { type: "CNAME", name: hostname, value: "fake-project.vercel-dns.test." },
        ],
      };
    },

    async verifyProjectDomain(hostname) {
      record("verifyProjectDomain", hostname);
      assertNotRateLimited();
      if (!verifyFails.has(hostname)) challenges.delete(hostname);
      return projectDomain(hostname);
    },

    async removeProjectDomain(hostname) {
      record("removeProjectDomain", hostname);
      projectDomains.delete(hostname);
    },

    async listProjectDomains() {
      record("listProjectDomains", null);
      return [...projectDomains];
    },

    async checkHttps(hostname): Promise<HttpsCheckResult> {
      record("checkHttps", hostname);
      const reason = httpsFailures.get(hostname);
      return reason === undefined ? { ok: true } : { ok: false, reason };
    },

    async evictResolveCache(tags) {
      evictions.push([...tags]);
    },

    setProof(hostname, tokens) {
      proofs.set(hostname, [...tokens]);
    },
    setInUseElsewhere(hostname, inUse) {
      if (inUse) inUseElsewhere.add(hostname);
      else inUseElsewhere.delete(hostname);
    },
    setChallenge(hostname, challenge) {
      if (challenge) challenges.set(hostname, challenge);
      else challenges.delete(hostname);
    },
    setVerifySucceeds(hostname, succeeds) {
      if (succeeds) verifyFails.delete(hostname);
      else verifyFails.add(hostname);
    },
    setMisconfigured(hostname, value) {
      if (value) misconfigured.add(hostname);
      else misconfigured.delete(hostname);
    },
    setRecommended(hostname, records) {
      recommended.set(hostname, records);
    },
    setHttpsFailure(hostname, reason) {
      if (reason === null) httpsFailures.delete(hostname);
      else httpsFailures.set(hostname, reason);
    },
    rateLimitUntil(retryAt) {
      rateLimitedUntil = retryAt;
    },
    count(method, hostname) {
      return calls.filter(
        (call) => call.method === method && (hostname === undefined || call.hostname === hostname),
      ).length;
    },
  };
}

// The production domains provider (issues #815, #834): Custom Domains are
// project domains on the Player's Vercel project (ADR-0023). Vercel's REST
// API adds, reads, verifies, lists and removes them; the Ownership Proof is
// looked up on public resolvers; the HTTPS check is a real request; and
// resolve's CDN responses are evicted with `dangerouslyDeleteByTag`.
//
// Response shapes follow Vercel's REST reference and are pinned by the
// recorded fixtures in vercel-fixtures/. The real-infrastructure proof
// (#841) re-records any fixture the live API contradicts.
import { Resolver } from "node:dns/promises";

import { dangerouslyDeleteByTag } from "@vercel/functions";
import { getDomain } from "tldts";

import {
  ProviderRateLimitedError,
  type CustomDomainsProvider,
  type DnsRecord,
  type DomainConfig,
  type HttpsCheckResult,
  type ProjectDomain,
} from "./provider";

const VERCEL_API = "https://api.vercel.com";
const HTTPS_CHECK_TIMEOUT_MS = 8_000;
// Public resolvers rather than the host's: AWS's resolver caches a missing
// record, so a proof published just after a failed lookup would stay
// invisible for the negative-cache lifetime (#825, decision 11).
const PROOF_RESOLVERS = ["1.1.1.1", "8.8.8.8"];

export interface VercelProviderConfig {
  readonly token: string;
  readonly teamId: string;
  readonly projectId: string;
}

export interface TxtResolver {
  resolveTxt(name: string): Promise<string[][]>;
}

export interface VercelProviderDependencies {
  /** Calls Vercel's REST API. */
  readonly apiFetch?: typeof fetch;
  /** Makes the HTTPS check's request. */
  readonly httpsFetch?: typeof fetch;
  readonly resolvers?: readonly TxtResolver[];
  readonly evictByTag?: (tags: string[]) => Promise<void>;
  readonly now?: () => Date;
}

/** Reads the provider's configuration, requiring every variable. */
export function vercelProviderConfig(
  env: Record<string, string | undefined>,
): VercelProviderConfig {
  const missing = ["VERCEL_TOKEN", "VERCEL_TEAM_ID", "VERCEL_PLAYER_PROJECT_ID"].filter(
    (name) => !env[name],
  );
  if (missing.length > 0) {
    throw new Error(`${missing.join(", ")} must be set when CUSTOM_DOMAINS_PROVIDER=vercel.`);
  }
  return {
    token: env.VERCEL_TOKEN!,
    teamId: env.VERCEL_TEAM_ID!,
    projectId: env.VERCEL_PLAYER_PROJECT_ID!,
  };
}

function publicResolver(server: string): TxtResolver {
  const resolver = new Resolver({ timeout: 3_000, tries: 2 });
  resolver.setServers([server]);
  return resolver;
}

interface VercelError {
  readonly code?: string;
  readonly message?: string;
  readonly limit?: { readonly reset?: number };
}

interface VercelProjectDomainBody {
  readonly name: string;
  readonly verified: boolean;
  readonly verification?: readonly {
    readonly type: string;
    readonly domain: string;
    readonly value: string;
  }[];
}

interface VercelConfigBody {
  readonly misconfigured: boolean;
  readonly recommendedIPv4?: readonly {
    readonly rank: number;
    readonly value: readonly string[];
  }[];
  readonly recommendedCNAME?: readonly { readonly rank: number; readonly value: string }[];
}

class VercelApiError extends Error {
  constructor(
    readonly status: number,
    readonly error: VercelError,
  ) {
    super(`Vercel API ${status}: ${error.code ?? "unknown"} ${error.message ?? ""}`.trim());
    this.name = "VercelApiError";
  }
}

function projectDomain(body: VercelProjectDomainBody): ProjectDomain {
  return {
    verified: body.verified,
    verification: body.verified
      ? []
      : (body.verification ?? [])
          .filter((challenge) => challenge.type === "TXT")
          .map((challenge) => ({ type: "TXT", name: challenge.domain, value: challenge.value })),
  };
}

function topRanked<T extends { rank: number }>(options: readonly T[] | undefined): T | undefined {
  return [...(options ?? [])].sort((a, b) => a.rank - b.rank)[0];
}

// Node's fetch wraps TLS and socket failures in a TypeError whose `cause`
// carries the OpenSSL or libuv code.
function httpsFailureReason(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return "The address didn't answer over HTTPS in time.";
  }
  const cause = error instanceof Error ? error.cause : undefined;
  const code =
    cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string"
      ? cause.code
      : "";
  if (code.startsWith("ERR_TLS") || code.includes("CERT") || code.includes("SELF_SIGNED")) {
    return "The address doesn't have a valid certificate yet.";
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return "The address doesn't resolve to anything.";
  }
  if (code === "ECONNREFUSED" || code === "ECONNRESET") {
    return "The address refused the connection.";
  }
  return "The address couldn't be reached over HTTPS.";
}

export function createVercelCustomDomainsProvider(
  config: VercelProviderConfig,
  dependencies: VercelProviderDependencies = {},
): CustomDomainsProvider {
  const apiFetch = dependencies.apiFetch ?? fetch;
  const httpsFetch = dependencies.httpsFetch ?? fetch;
  const resolvers = dependencies.resolvers ?? PROOF_RESOLVERS.map(publicResolver);
  const evictByTag = dependencies.evictByTag ?? ((tags) => dangerouslyDeleteByTag(tags));
  const now = dependencies.now ?? (() => new Date());
  const project = encodeURIComponent(config.projectId);

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = new URL(path, VERCEL_API);
    url.searchParams.set("teamId", config.teamId);
    const response = await apiFetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const parsed: unknown = text ? JSON.parse(text) : {};
    // Vercel's documented response shape, pinned by the recorded fixtures.
    const result = parsed as T;
    if (response.ok) return result;

    const error: VercelError =
      parsed && typeof parsed === "object" && "error" in parsed && parsed.error
        ? (parsed.error as VercelError)
        : {};
    if (response.status === 429 || error.code === "rate_limit_exceeded") {
      const resetSeconds = error.limit?.reset ?? Number(response.headers.get("x-ratelimit-reset"));
      throw new ProviderRateLimitedError(
        Number.isFinite(resetSeconds) && resetSeconds > 0
          ? new Date(resetSeconds * 1000)
          : new Date(now().getTime() + 60_000),
      );
    }
    throw new VercelApiError(response.status, error);
  }

  async function getProjectDomain(hostname: string): Promise<ProjectDomain | null> {
    try {
      return projectDomain(
        await request<VercelProjectDomainBody>(
          "GET",
          `/v9/projects/${project}/domains/${encodeURIComponent(hostname)}`,
        ),
      );
    } catch (error) {
      if (error instanceof VercelApiError && error.status === 404) return null;
      throw error;
    }
  }

  return {
    name: "vercel",
    allowLocalhost: false,

    async lookupOwnershipProof(hostname) {
      const answers = await Promise.allSettled(
        resolvers.map((resolver) => resolver.resolveTxt(`_mechane.${hostname}`)),
      );
      // A TXT record may be split into several strings; they join into one value.
      const values = answers.flatMap((answer) =>
        answer.status === "fulfilled" ? answer.value.map((chunks) => chunks.join("")) : [],
      );
      return [...new Set(values)];
    },

    async addProjectDomain(hostname) {
      try {
        return {
          kind: "added",
          domain: projectDomain(
            await request<VercelProjectDomainBody>("POST", `/v10/projects/${project}/domains`, {
              name: hostname,
            }),
          ),
        };
      } catch (error) {
        if (!(error instanceof VercelApiError) || (error.status !== 409 && error.status !== 403)) {
          throw error;
        }
        // A contested takeover can leave the hostname on our own project,
        // which Vercel also answers with a conflict; that counts as added.
        const existing = await getProjectDomain(hostname);
        return existing ? { kind: "added", domain: existing } : { kind: "in_use_elsewhere" };
      }
    },

    getProjectDomain,

    async getDomainConfig(hostname): Promise<DomainConfig> {
      const body = await request<VercelConfigBody>(
        "GET",
        `/v6/domains/${encodeURIComponent(hostname)}/config?projectIdOrName=${project}`,
      );
      const apex = getDomain(hostname) === hostname;
      const recommended: DnsRecord[] = [];
      if (apex) {
        const address = topRanked(body.recommendedIPv4)?.value[0];
        if (address) recommended.push({ type: "A", name: hostname, value: address });
      } else {
        const target = topRanked(body.recommendedCNAME)?.value;
        if (target) recommended.push({ type: "CNAME", name: hostname, value: target });
      }
      return { misconfigured: body.misconfigured, recommended };
    },

    async verifyProjectDomain(hostname) {
      try {
        return projectDomain(
          await request<VercelProjectDomainBody>(
            "POST",
            `/v9/projects/${project}/domains/${encodeURIComponent(hostname)}/verify`,
          ),
        );
      } catch (error) {
        // An unmet challenge is an answer, not a failure: report the
        // domain's current state with its challenge still outstanding.
        if (!(error instanceof VercelApiError) || error.status !== 400) throw error;
        return (await getProjectDomain(hostname)) ?? { verified: false, verification: [] };
      }
    },

    async removeProjectDomain(hostname) {
      const name = encodeURIComponent(hostname);
      for (const path of [`/v9/projects/${project}/domains/${name}`, `/v6/domains/${name}`]) {
        try {
          await request("DELETE", path);
        } catch (error) {
          // Already gone; or, for the account-level delete, never ours.
          if (
            !(error instanceof VercelApiError) ||
            (error.status !== 404 && error.status !== 403)
          ) {
            throw error;
          }
        }
      }
    },

    async listProjectDomains() {
      const hostnames: string[] = [];
      let until: number | null = null;
      do {
        const page: {
          domains: readonly { name: string }[];
          pagination?: { next: number | null };
        } = await request(
          "GET",
          `/v9/projects/${project}/domains?limit=100${until === null ? "" : `&until=${until}`}`,
        );
        hostnames.push(...page.domains.map((domain) => domain.name));
        until = page.pagination?.next ?? null;
      } while (until !== null);
      return hostnames;
    },

    async checkHttps(hostname): Promise<HttpsCheckResult> {
      try {
        const response = await httpsFetch(`https://${hostname}/`, {
          redirect: "manual",
          signal: AbortSignal.timeout(HTTPS_CHECK_TIMEOUT_MS),
        });
        await response.body?.cancel();
        return response.status >= 500
          ? { ok: false, reason: `The address answered with an error (${response.status}).` }
          : { ok: true };
      } catch (error) {
        return { ok: false, reason: httpsFailureReason(error) };
      }
    },

    async evictResolveCache(tags) {
      try {
        await evictByTag([...tags]);
      } catch (error) {
        console.warn("Evicting resolve's cache failed; it expires within a minute.", error);
      }
    },
  };
}

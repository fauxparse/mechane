// The Vercel domains provider (issue #834) against recorded response
// fixtures, with no network access: each Vercel answer maps to the seam's
// typed results.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { hostnameRefusalCode } from "./hostname";
import { ProviderRateLimitedError } from "./provider";
import {
  createVercelCustomDomainsProvider,
  vercelProviderConfig,
  type TxtResolver,
  type VercelProviderDependencies,
} from "./vercel-provider";

const HOST = "vote.knifefight.nz";
const CONFIG = { token: "token", teamId: "team_mechane", projectId: "prj_player" };

interface Fixture {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

function fixture(name: string): Fixture {
  return JSON.parse(
    readFileSync(new URL(`./vercel-fixtures/${name}.json`, import.meta.url), "utf8"),
  );
}

/** Answers each "METHOD /path" (query string ignored) with a named fixture. */
function vercelApi(routes: Record<string, string | string[]>) {
  const requests: { method: string; url: URL; authorization: string | null }[] = [];
  const queues = new Map(
    Object.entries(routes).map(([key, names]) => [
      key,
      Array.isArray(names) ? [...names] : [names],
    ]),
  );
  const apiFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    requests.push({
      method,
      url,
      authorization: new Headers(init?.headers).get("authorization"),
    });
    const queue = queues.get(`${method} ${url.pathname}`);
    const name = queue && (queue.length > 1 ? queue.shift() : queue[0]);
    if (!name) throw new Error(`No fixture for ${method} ${url.pathname}`);
    const { status, headers, body } = fixture(name);
    return new Response(JSON.stringify(body), { status, headers });
  };
  return { apiFetch, requests };
}

function provider(dependencies: VercelProviderDependencies) {
  return createVercelCustomDomainsProvider(CONFIG, {
    now: () => new Date("2026-10-01T00:00:00Z"),
    ...dependencies,
  });
}

const DOMAIN_PATH = `/v9/projects/prj_player/domains/${HOST}`;

describe("the Vercel domains provider", () => {
  it("requires its credentials and refuses .localhost", () => {
    expect(() => vercelProviderConfig({ VERCEL_TOKEN: "t" })).toThrow(
      /VERCEL_TEAM_ID, VERCEL_PLAYER_PROJECT_ID/,
    );
    const vercel = provider({});
    expect(hostnameRefusalCode("vote.x.localhost", { allowLocalhost: vercel.allowLocalhost })).toBe(
      "localhost",
    );
  });

  it("reads a verified project domain", async () => {
    const { apiFetch, requests } = vercelApi({ [`GET ${DOMAIN_PATH}`]: "project-domain-verified" });

    expect(await provider({ apiFetch }).getProjectDomain(HOST)).toEqual({
      verified: true,
      verification: [],
    });
    expect(requests[0]!.url.searchParams.get("teamId")).toBe("team_mechane");
    expect(requests[0]!.authorization).toBe("Bearer token");
  });

  it("adds a domain that comes back unverified with a _vercel challenge", async () => {
    const { apiFetch } = vercelApi({
      "POST /v10/projects/prj_player/domains": "project-domain-challenge",
    });

    expect(await provider({ apiFetch }).addProjectDomain(HOST)).toEqual({
      kind: "added",
      domain: {
        verified: false,
        verification: [
          {
            type: "TXT",
            name: "_vercel.knifefight.nz",
            value: "vc-domain-verify=vote.knifefight.nz,5f3c9e1a2b7d4c60a8e1",
          },
        ],
      },
    });
  });

  it("reports misconfigured DNS with the project's own top-ranked records", async () => {
    const { apiFetch, requests } = vercelApi({
      [`GET /v6/domains/${HOST}/config`]: "config-misconfigured",
      "GET /v6/domains/knifefight.nz/config": "config-misconfigured",
    });
    const vercel = provider({ apiFetch });

    expect(await vercel.getDomainConfig(HOST)).toEqual({
      misconfigured: true,
      recommended: [{ type: "CNAME", name: HOST, value: "d1d4fc829fe7bc7c.vercel-dns-017.com." }],
    });
    expect(requests[0]!.url.searchParams.get("projectIdOrName")).toBe("prj_player");
    expect((await vercel.getDomainConfig("knifefight.nz")).recommended).toEqual([
      { type: "A", name: "knifefight.nz", value: "216.198.79.1" },
    ]);
  });

  it("turns rate_limit_exceeded into a typed error carrying the retry time", async () => {
    const { apiFetch } = vercelApi({
      "POST /v10/projects/prj_player/domains": "rate-limit-exceeded",
      [`POST ${DOMAIN_PATH}/verify`]: "rate-limit-exceeded",
    });
    const vercel = provider({ apiFetch });

    const error = await vercel.addProjectDomain(HOST).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderRateLimitedError);
    expect((error as ProviderRateLimitedError).retryAt).toEqual(new Date(1790557200 * 1000));
    await expect(vercel.verifyProjectDomain(HOST)).rejects.toBeInstanceOf(ProviderRateLimitedError);
  });

  it("reports a hostname another Vercel account holds as in use elsewhere", async () => {
    const { apiFetch } = vercelApi({
      "POST /v10/projects/prj_player/domains": "add-in-use-by-another-account",
      [`GET ${DOMAIN_PATH}`]: "not-found",
    });

    expect(await provider({ apiFetch }).addProjectDomain(HOST)).toEqual({
      kind: "in_use_elsewhere",
    });
  });

  it("counts a conflict for a hostname already on the project as added", async () => {
    const { apiFetch } = vercelApi({
      "POST /v10/projects/prj_player/domains": "add-in-use-by-another-account",
      [`GET ${DOMAIN_PATH}`]: "project-domain-verified",
    });

    expect(await provider({ apiFetch }).addProjectDomain(HOST)).toEqual({
      kind: "added",
      domain: { verified: true, verification: [] },
    });
  });

  it("reports an unmet challenge on verify as still outstanding", async () => {
    const { apiFetch } = vercelApi({
      [`POST ${DOMAIN_PATH}/verify`]: "verify-missing-txt",
      [`GET ${DOMAIN_PATH}`]: "project-domain-challenge",
    });

    const verified = await provider({ apiFetch }).verifyProjectDomain(HOST);
    expect(verified.verified).toBe(false);
    expect(verified.verification).toHaveLength(1);
  });

  it("detaches from the project and deletes from the account, treating 404 as gone", async () => {
    const { apiFetch, requests } = vercelApi({
      [`DELETE ${DOMAIN_PATH}`]: "not-found",
      [`DELETE /v6/domains/${HOST}`]: "deleted",
    });

    await provider({ apiFetch }).removeProjectDomain(HOST);

    expect(requests.map((request) => `${request.method} ${request.url.pathname}`)).toEqual([
      `DELETE ${DOMAIN_PATH}`,
      `DELETE /v6/domains/${HOST}`,
    ]);
  });

  it("lists every page of the project's domains", async () => {
    const { apiFetch, requests } = vercelApi({
      "GET /v9/projects/prj_player/domains": ["list-page-1", "list-page-2"],
    });

    expect(await provider({ apiFetch }).listProjectDomains()).toEqual([
      "show.mechane.live",
      HOST,
      "orphan.example.nz",
    ]);
    expect(requests[1]!.url.searchParams.get("until")).toBe("1790553500000");
  });

  it("queries both public resolvers and accepts the proof from either", async () => {
    const asked: string[] = [];
    const resolver = (answer: () => Promise<string[][]>): TxtResolver => ({
      resolveTxt: async (name) => {
        asked.push(name);
        return answer();
      },
    });
    const vercel = provider({
      resolvers: [
        resolver(async () => {
          throw Object.assign(new Error("queryTxt ENODATA"), { code: "ENODATA" });
        }),
        resolver(async () => [["mechane-proof=", "abc123"], ["unrelated"]]),
      ],
    });

    expect(await vercel.lookupOwnershipProof(HOST)).toEqual(["mechane-proof=abc123", "unrelated"]);
    expect(asked).toEqual([`_mechane.${HOST}`, `_mechane.${HOST}`]);
  });

  it("fails the HTTPS check on a certificate error, and passes on any served page", async () => {
    const certificateError = new TypeError("fetch failed", {
      cause: Object.assign(new Error("certificate has expired"), { code: "CERT_HAS_EXPIRED" }),
    });
    const failing = provider({
      httpsFetch: async () => {
        throw certificateError;
      },
    });
    const check = await failing.checkHttps(HOST);
    expect(check.ok).toBe(false);
    expect(check.ok ? "" : check.reason).toMatch(/certificate/);

    const requested: { url: string; redirect?: RequestRedirect }[] = [];
    const passing = provider({
      httpsFetch: async (input, init) => {
        requested.push({ url: String(input), redirect: init?.redirect });
        return new Response(null, { status: 308 });
      },
    });
    expect(await passing.checkHttps(HOST)).toEqual({ ok: true });
    expect(requested).toEqual([{ url: `https://${HOST}/`, redirect: "manual" }]);
  });

  it("evicts by tag, logging rather than throwing when eviction fails", async () => {
    const evicted: string[][] = [];
    await provider({ evictByTag: async (tags) => void evicted.push(tags) }).evictResolveCache([
      "player-domain:vote.x.nz",
      "player-domain:x.nz",
    ]);
    expect(evicted).toEqual([["player-domain:vote.x.nz", "player-domain:x.nz"]]);

    await expect(
      provider({
        evictByTag: async () => {
          throw new Error("purge unavailable");
        },
      }).evictResolveCache(["player-domain:x.nz"]),
    ).resolves.toBeUndefined();
  });
});

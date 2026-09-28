// The domains provider seam (issue #832): production refuses anything but
// Vercel, and the local provider passes every check until `pnpm dev:domains`
// overrides one hostname's facts.
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "../db/client";
import { customDomainOverrides, customDomains, user } from "../db/schema";
import { setupPostgresTest } from "../db/test-helpers";
import { runDevDomains } from "./dev-domains";
import { hostnameRefusalCode } from "./hostname";
import { localCustomDomainsProvider as local } from "./local-provider";
import { customDomainsProviderName } from "./provider";
import { createUser, insertCustomDomain } from "./test-fixtures";

const { userId, createShow } = setupPostgresTest("provider-test");
const hostnames: string[] = [];
const otherUsers: string[] = [];

function localHostname(label: string): string {
  const hostname = `${label}-${crypto.randomUUID().slice(0, 8)}.x.localhost`;
  hostnames.push(hostname);
  return hostname;
}

afterEach(async () => {
  for (const hostname of hostnames.splice(0)) {
    await db.delete(customDomainOverrides).where(eq(customDomainOverrides.hostname, hostname));
  }
  for (const id of otherUsers.splice(0)) await db.delete(user).where(eq(user.id, id));
});

describe("customDomainsProviderName", () => {
  it("refuses to start production with the provider unset or local", () => {
    expect(() => customDomainsProviderName({ NODE_ENV: "production" })).toThrow(/vercel/);
    expect(() =>
      customDomainsProviderName({ NODE_ENV: "production", CUSTOM_DOMAINS_PROVIDER: "local" }),
    ).toThrow(/vercel/);
    expect(
      customDomainsProviderName({ NODE_ENV: "production", CUSTOM_DOMAINS_PROVIDER: "vercel" }),
    ).toBe("vercel");
  });

  it("defaults to local outside production and refuses unknown names", () => {
    expect(customDomainsProviderName({})).toBe("local");
    expect(() => customDomainsProviderName({ CUSTOM_DOMAINS_PROVIDER: "cloudflare" })).toThrow();
  });
});

describe("the local provider", () => {
  it("accepts .localhost hostnames", () => {
    expect(
      hostnameRefusalCode("vote.x.localhost", { allowLocalhost: local.allowLocalhost }),
    ).toBeNull();
  });

  it("passes every check for a fresh domain", async () => {
    await createShow();
    const hostname = localHostname("fresh");
    const domain = await insertCustomDomain({ userId, hostname });

    expect(await local.lookupOwnershipProof(hostname)).toEqual([
      `mechane-proof=${domain.proofToken}`,
    ]);
    expect(await local.addProjectDomain(hostname)).toEqual({
      kind: "added",
      domain: { verified: true, verification: [] },
    });
    expect((await local.getDomainConfig(hostname)).misconfigured).toBe(false);
    expect(await local.checkHttps(hostname)).toEqual({ ok: true });
  });

  it("reports one hostname misconfigured after `point`, until `clear`", async () => {
    const pointed = localHostname("pointed");
    const other = localHostname("other");

    await runDevDomains([pointed, "point"]);
    expect((await local.getDomainConfig(pointed)).misconfigured).toBe(true);
    expect((await local.getDomainConfig(other)).misconfigured).toBe(false);
    expect(await local.checkHttps(pointed)).toEqual({ ok: true });

    await runDevDomains([pointed.toUpperCase(), "clear"]);
    expect((await local.getDomainConfig(pointed)).misconfigured).toBe(false);
  });

  it("fails the HTTPS check after `cert`, and both after `drift`", async () => {
    const cert = localHostname("cert");
    const drift = localHostname("drift");

    await runDevDomains([cert, "cert"]);
    await runDevDomains([drift, "drift"]);

    expect((await local.checkHttps(cert)).ok).toBe(false);
    expect((await local.getDomainConfig(cert)).misconfigured).toBe(false);
    expect((await local.checkHttps(drift)).ok).toBe(false);
    expect((await local.getDomainConfig(drift)).misconfigured).toBe(true);
  });

  it("withholds every proof after `proof`, or all but one user's with --keep", async () => {
    await createShow();
    const challenger = await createUser("provider-test-challenger");
    otherUsers.push(challenger);
    const hostname = localHostname("contested");
    const held = await insertCustomDomain({ userId, hostname, status: "live" });
    const challenge = await insertCustomDomain({ userId: challenger, hostname });

    await runDevDomains([hostname, "proof"]);
    expect(await local.lookupOwnershipProof(hostname)).toEqual([]);

    await runDevDomains([hostname, "proof", "--keep", `${challenger}@example.com`]);
    expect(await local.lookupOwnershipProof(hostname)).toEqual([
      `mechane-proof=${challenge.proofToken}`,
    ]);

    await runDevDomains([hostname, "clear"]);
    expect([...(await local.lookupOwnershipProof(hostname))].sort()).toEqual(
      [held.proofToken, challenge.proofToken].map((token) => `mechane-proof=${token}`).sort(),
    );
  });

  it("backdates when a proven domain's proof went missing with --since", async () => {
    await createShow();
    const hostname = localHostname("lapsing");
    const domain = await insertCustomDomain({ userId, hostname, status: "needs_attention" });

    await runDevDomains([hostname, "proof", "--since", "8d"]);

    const [row] = await db
      .select({ missingSince: customDomains.proofWentMissingAt })
      .from(customDomains)
      .where(eq(customDomains.id, domain.id));
    const days = (Date.now() - row!.missingSince!.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(8, 1);
  });

  it("refuses an unknown command", async () => {
    await expect(runDevDomains(["vote.x.localhost", "explode"])).rejects.toThrow(/Usage/);
  });
});

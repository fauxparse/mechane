// The Player's host-based entry (issue #831) with the host injected: the
// canonical host keeps the pairing form and calls nothing, and a Custom
// Domain resolves to its Device, the holding page, or "busy".
import { describe, expect, it, vi } from "vitest";

import { MAX_RESOLVE_RETRY_WAIT_MS, resolveHostEntry } from "./host-entry";

const CANONICAL = "https://show.mechane.dev";
const API = "http://localhost:4000";

function respond(...responses: Response[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  return fetch;
}

function tooMany(retryAfter: string): Response {
  return new Response("{}", { status: 429, headers: { "Retry-After": retryAfter } });
}

describe("resolveHostEntry", () => {
  it("opens the Device a Custom Domain resolves to, asking without credentials", async () => {
    const fetch = respond(Response.json({ pairingCode: "4QKEW" }));

    const entry = await resolveHostEntry("vote.x.localhost:5174", {
      canonicalOrigin: CANONICAL,
      apiBaseUrl: API,
      fetch,
    });

    expect(entry).toEqual({ kind: "device", pairingCode: "4QKEW" });
    expect(fetch).toHaveBeenCalledWith(
      `${API}/api/player-domains/resolve?host=vote.x.localhost%3A5174`,
      expect.objectContaining({ credentials: "omit" }),
    );
  });

  it("shows the holding page for a host that opens nothing", async () => {
    const entry = await resolveHostEntry("vote.x.localhost", {
      canonicalOrigin: CANONICAL,
      apiBaseUrl: API,
      fetch: respond(Response.json({ error: "Not found." }, { status: 404 })),
    });

    expect(entry).toEqual({ kind: "not_found" });
  });

  it("retries a 429 once after a capped Retry-After, then reports busy", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetch = respond(tooMany("45"), tooMany("45"));

    const entry = await resolveHostEntry("vote.x.localhost", {
      canonicalOrigin: CANONICAL,
      apiBaseUrl: API,
      fetch,
      sleep,
    });

    expect(entry).toEqual({ kind: "busy" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(MAX_RESOLVE_RETRY_WAIT_MS);
  });

  it("opens the Device when the retry succeeds", async () => {
    const entry = await resolveHostEntry("vote.x.localhost", {
      canonicalOrigin: CANONICAL,
      apiBaseUrl: API,
      fetch: respond(tooMany("1"), Response.json({ pairingCode: "4QKEW" })),
      sleep: async () => undefined,
    });

    expect(entry).toEqual({ kind: "device", pairingCode: "4QKEW" });
  });

  it("keeps the pairing form on the canonical host and calls nothing", async () => {
    const fetch = respond();

    for (const host of ["show.mechane.dev", "localhost:5174", "mechane-player-git-x.vercel.app"]) {
      expect(
        await resolveHostEntry(host, { canonicalOrigin: CANONICAL, apiBaseUrl: API, fetch }),
      ).toEqual({ kind: "canonical" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});

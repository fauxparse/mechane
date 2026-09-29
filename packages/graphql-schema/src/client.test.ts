import { afterEach, describe, expect, it, vi } from "vitest";

import { graphqlRequest } from "./client";
import { MeQuery } from "./me";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch() {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: { me: null } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("graphqlRequest", () => {
  it("sends credentials by default, for Studio's session cookie", async () => {
    const fetch = stubFetch();

    await graphqlRequest("http://api.test/api/graphql", MeQuery);

    expect(fetch.mock.calls[0]?.[1]?.credentials).toBe("include");
  });

  it("omits credentials when asked", async () => {
    const fetch = stubFetch();

    await graphqlRequest("http://api.test/api/graphql", MeQuery, {}, { credentials: "omit" });

    expect(fetch.mock.calls[0]?.[1]?.credentials).toBe("omit");
  });
});

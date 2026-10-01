import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchPlayerRunState, fetchPlayerSession, submitPlayerEvent } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Player GraphQL requests", () => {
  it("never send credentials: the pairing code is the Player's only credential", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        data: { playerSession: null, playerRunState: null, submitPlayerEvent: null },
      }),
    );
    vi.stubGlobal("fetch", fetch);

    await fetchPlayerSession("4qkew").catch(() => undefined);
    await fetchPlayerRunState(" 4qkew ").catch(() => undefined);
    await submitPlayerEvent("4QKEW", {
      eventId: "event_1",
      publishedGraphVersion: 1,
      sceneId: "scene_1",
      elementId: "element_1",
      eventKind: "tap",
    }).catch(() => undefined);

    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [, init] of fetch.mock.calls) {
      expect(init?.credentials).toBe("omit");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer 4QKEW");
    }
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { issueRealtimeGrant, verifyRealtimeGrant } from "./realtime-grants";

const secret = "realtime-grant-test-secret";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("realtime grants", () => {
  it("round-trips an opaque device grant and rejects tampering", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", secret);
    const issued = issueRealtimeGrant({ kind: "player", deviceId: "device_navigation" }, 1_000);

    expect(issued.token).not.toContain("device_navigation");
    expect(verifyRealtimeGrant(issued.token, 1_001)).toMatchObject({
      kind: "player",
      deviceId: "device_navigation",
      channel: issued.channel,
      expiresAt: 61_000,
    });
    expect(verifyRealtimeGrant(`${issued.token}x`, 1_001)).toBeNull();
  });

  it("keeps a Show grant to its Show's channel, apart from any Device's", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", secret);
    const show = verifyRealtimeGrant(
      issueRealtimeGrant({ kind: "show", showId: "show_knife" }, 1_000).token,
      1_001,
    );
    const otherShow = issueRealtimeGrant({ kind: "show", showId: "show_other" }, 1_000);
    const device = issueRealtimeGrant({ kind: "player", deviceId: "show_knife" }, 1_000);

    expect(show).toMatchObject({ kind: "show", showId: "show_knife" });
    expect(show?.channel).not.toBe(otherShow.channel);
    expect(show?.channel).not.toBe(device.channel);
  });

  it("expires grants before they can authorize a subscription", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", secret);
    const issued = issueRealtimeGrant({ kind: "player", deviceId: "device_navigation" }, 1_000);

    expect(verifyRealtimeGrant(issued.token, 61_000)).toBeNull();
  });
});

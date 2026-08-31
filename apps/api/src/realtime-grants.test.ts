import { afterEach, describe, expect, it, vi } from "vitest";

import { issueRealtimeGrant, verifyRealtimeGrant } from "./realtime-grants";

const secret = "realtime-grant-test-secret";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("realtime grants", () => {
  it("round-trips an opaque device grant and rejects tampering", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", secret);
    const issued = issueRealtimeGrant("device_navigation", 1_000);

    expect(issued.token).not.toContain("device_navigation");
    expect(verifyRealtimeGrant(issued.token, 1_001)).toMatchObject({
      deviceId: "device_navigation",
      channel: issued.channel,
      expiresAt: 61_000,
    });
    expect(verifyRealtimeGrant(`${issued.token}x`, 1_001)).toBeNull();
  });

  it("expires grants before they can authorize a subscription", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", secret);
    const issued = issueRealtimeGrant("device_navigation", 1_000);

    expect(verifyRealtimeGrant(issued.token, 61_000)).toBeNull();
  });
});

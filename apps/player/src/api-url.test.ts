import { describe, expect, it } from "vitest";
import { defaultApiBaseUrl, resolveApiUrl, shouldUseRealtimeSocket } from "./api-url";

describe("defaultApiBaseUrl", () => {
  it("uses the deployed API for production builds", () => {
    expect(defaultApiBaseUrl(true, false)).toBe("https://api.mechane.dev");
  });

  it("uses the deployed API when the local HTTPS proxy is enabled", () => {
    expect(defaultApiBaseUrl(false, true)).toBe("https://api.mechane.dev");
  });

  it("keeps direct HTTP development available", () => {
    expect(defaultApiBaseUrl(false, false)).toBe("http://localhost:4000");
  });
});

describe("resolveApiUrl", () => {
  it("resolves API-relative image paths against the Player API", () => {
    expect(resolveApiUrl("/api/images/alice/seed-v1", "https://api.mechane.dev")).toBe(
      "https://api.mechane.dev/api/images/alice/seed-v1",
    );
  });
});

describe("shouldUseRealtimeSocket", () => {
  it("uses the local socket adapter during development", () => {
    expect(shouldUseRealtimeSocket(false, false)).toBe(true);
    expect(shouldUseRealtimeSocket(false, true)).toBe(true);
  });

  it("does not connect to the local socket adapter in production", () => {
    expect(shouldUseRealtimeSocket(true, false)).toBe(false);
  });
});

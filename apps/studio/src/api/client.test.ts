import { describe, expect, it } from "vitest";

import { resolveApiUrl } from "./client";

describe("resolveApiUrl", () => {
  it("routes relative upload plans to the API origin", () => {
    expect(resolveApiUrl("/api/uploads/session-1")).toBe(
      "http://localhost:4000/api/uploads/session-1",
    );
  });

  it("preserves absolute storage URLs", () => {
    expect(resolveApiUrl("https://storage.example.test/upload/session-1")).toBe(
      "https://storage.example.test/upload/session-1",
    );
  });
});

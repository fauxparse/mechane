// The one piece of real logic added for issue #13's cross-origin sign-in
// fix: deciding which request origins are allowed to receive credentialed
// CORS headers. Getting this wrong either breaks sign-in (too strict) or
// lets an arbitrary origin ride a signed-in user's session cookie (too
// loose), so it's worth a couple of direct assertions rather than only
// exercising it indirectly through the HTTP handlers.
import { describe, expect, it } from "vitest";

import { applyCorsHeaders, isAllowedOrigin } from "./cors";

describe("isAllowedOrigin", () => {
  it("accepts the configured app-studio origin", () => {
    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
  });

  it("rejects an unrecognized origin", () => {
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
  });

  it("rejects a missing origin (same-origin requests, curl, etc.)", () => {
    expect(isAllowedOrigin(undefined)).toBe(false);
  });
});

describe("applyCorsHeaders", () => {
  function fakeResponse() {
    const headers = new Map<string, string>();
    return {
      headers,
      setHeader: (name: string, value: string) => headers.set(name, value),
    };
  }

  it("sets credentialed CORS headers for an allowed origin", () => {
    const res = fakeResponse();
    applyCorsHeaders(res, "http://localhost:5173", "POST");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("sets no headers for a disallowed origin", () => {
    const res = fakeResponse();
    applyCorsHeaders(res, "https://evil.example.com", "POST");
    expect(res.headers.size).toBe(0);
  });

  it("reports OPTIONS requests as preflight, regardless of origin", () => {
    const res = fakeResponse();
    expect(applyCorsHeaders(res, "http://localhost:5173", "OPTIONS")).toBe(true);
    expect(applyCorsHeaders(res, undefined, "OPTIONS")).toBe(true);
  });

  it("reports non-OPTIONS requests as not preflight", () => {
    const res = fakeResponse();
    expect(applyCorsHeaders(res, "http://localhost:5173", "POST")).toBe(false);
  });
});

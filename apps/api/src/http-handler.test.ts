// Split-horizon CORS as a browser meets it (issue #830, ADR-0023): the
// routes a Player on a Custom Domain calls answer a foreign origin with `*`
// and no credentials, at preflight and on the request itself, while Studio
// keeps its credentialed exact-origin CORS and sign-in stays first-party.
import { createServer } from "node:http";

import { describe, expect, it } from "vitest";

import { httpHandler } from "./http-handler";

const FOREIGN = "http://vote.x.localhost:5174";
const STUDIO = "http://localhost:5173";

async function request(path: string, init: RequestInit): Promise<Response> {
  const server = createServer((req, res) => void httpHandler(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not start.");
  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, init);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function preflight(path: string, origin: string): Promise<Response> {
  return request(path, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, content-type",
    },
  });
}

function postGraphql(origin: string): Promise<Response> {
  return request("/api/graphql", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ __typename }" }),
  });
}

describe("split-horizon CORS", () => {
  it("grants a foreign origin * without credentials on GraphQL, at preflight and on POST", async () => {
    const options = await preflight("/api/graphql", FOREIGN);
    expect(options.status).toBe(204);
    expect(options.headers.get("access-control-allow-origin")).toBe("*");
    expect(options.headers.get("access-control-allow-credentials")).toBeNull();
    expect(options.headers.get("access-control-allow-headers")).toMatch(/authorization/i);

    const post = await postGraphql(FOREIGN);
    expect(post.status).toBe(200);
    expect(post.headers.get("access-control-allow-origin")).toBe("*");
    expect(post.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("keeps Studio's credentialed exact-origin CORS", async () => {
    const options = await preflight("/api/graphql", STUDIO);
    expect(options.headers.get("access-control-allow-origin")).toBe(STUDIO);
    expect(options.headers.get("access-control-allow-credentials")).toBe("true");

    const post = await postGraphql(STUDIO);
    expect(post.headers.get("access-control-allow-origin")).toBe(STUDIO);
    expect(post.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("grants a foreign origin * on realtime auth", async () => {
    const options = await preflight("/api/realtime/auth", FOREIGN);
    expect(options.headers.get("access-control-allow-origin")).toBe("*");
    expect(options.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("gives a foreign origin nothing on sign-in routes", async () => {
    const options = await preflight("/api/auth/sign-in/email", FOREIGN);
    expect(options.headers.get("access-control-allow-origin")).toBeNull();
  });
});

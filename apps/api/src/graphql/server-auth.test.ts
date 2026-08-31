import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { auth } from "../auth";
import { db } from "../db/client";
import { user } from "../db/schema";
import { yoga } from "./server";

const userId = `graphql-auth-test-${crypto.randomUUID()}`;
const email = `${userId}@example.com`;
const password = "P4$$w0rd!";

async function createAuthenticatedCookie(): Promise<string> {
  await auth.api.signUpEmail({ body: { name: "GraphQL Auth Test", email, password } });
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, email));
  const response = await auth.handler(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Sign-in did not return a session cookie.");
  return cookie;
}

afterEach(async () => {
  await db.delete(user).where(eq(user.email, email));
});

describe("GraphQL HTTP authentication", () => {
  it("resolves Better Auth sessions from the incoming cookie", async () => {
    const cookie = await createAuthenticatedCookie();

    const response = await yoga.fetch("http://localhost/api/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ query: "{ me { email } }" }),
    });
    const body = (await response.json()) as {
      data?: { me?: { email: string } | null };
    };
    expect(response.ok).toBe(true);
    expect(body.data?.me).toEqual({ email });
  });
});

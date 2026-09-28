import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { auth } from "../auth";
import { db } from "../db/client";
import { user } from "../db/schema";
import { yoga } from "./server";

const runId = crypto.randomUUID();
const email = `graphql-auth-test-${runId}@example.com`;
const adminEmail = `graphql-auth-admin-${runId}@example.com`;
const password = "P4$$w0rd!";

function sessionCookie(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(";", 1)[0] ?? "")
    .find((pair) => pair.includes("session_token=") && !pair.endsWith("="));
  if (!cookie) throw new Error("The response did not set a session cookie.");
  return cookie;
}

async function createAuthenticatedCookie(address: string, role = "user"): Promise<string> {
  await auth.api.signUpEmail({ body: { name: "GraphQL Auth Test", email: address, password } });
  await db.update(user).set({ emailVerified: true, role }).where(eq(user.email, address));
  const response = await auth.handler(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address, password }),
    }),
  );
  return sessionCookie(response);
}

async function query<T>(cookie: string, source: string): Promise<T | undefined> {
  const response = await yoga.fetch("http://localhost/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ query: source }),
  });
  expect(response.ok).toBe(true);
  const body: { data?: T } = await response.json();
  return body.data;
}

afterEach(async () => {
  await db.delete(user).where(inArray(user.email, [email, adminEmail]));
});

describe("GraphQL HTTP authentication", () => {
  it("resolves Better Auth sessions from the incoming cookie", async () => {
    const cookie = await createAuthenticatedCookie(email);

    const data = await query<{ me: { email: string; role: string } | null; impersonator: null }>(
      cookie,
      "{ me { email role } impersonator { email } }",
    );
    expect(data).toEqual({ me: { email, role: "user" }, impersonator: null });
  });

  it("resolves an impersonation session as the impersonated user, naming the admin", async () => {
    const adminCookie = await createAuthenticatedCookie(adminEmail, "admin");
    await createAuthenticatedCookie(email);
    const [target] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));

    const response = await auth.handler(
      new Request("http://localhost/api/auth/admin/impersonate-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ userId: target?.id }),
      }),
    );
    expect(response.ok).toBe(true);

    const data = await query<{
      me: { email: string; role: string } | null;
      impersonator: { email: string; role: string } | null;
    }>(sessionCookie(response), "{ me { email role } impersonator { email role } }");
    expect(data).toEqual({
      me: { email, role: "user" },
      impersonator: { email: adminEmail, role: "admin" },
    });
  });
});

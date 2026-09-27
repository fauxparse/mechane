import { eq } from "drizzle-orm";
import { createYoga } from "graphql-yoga";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "../db/client";
import { waitlistEntries } from "../db/schema";
import type { GraphQLContext } from "./context";
import { schema } from "./schema";

const email = `waitlist-test-${crypto.randomUUID()}@example.com`;

async function joinWaitlist(address: string) {
  const yoga = createYoga<GraphQLContext>({
    schema,
    context: () => ({ userId: null, user: null }),
    graphqlEndpoint: "/api/graphql",
    // A masked "Unexpected error." would hide which code the resolver chose.
    maskedErrors: false,
  });
  const response = await yoga.fetch("http://localhost/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "mutation ($email: String!) { joinWaitlist(email: $email) }",
      variables: { email: address },
    }),
  });
  return (await response.json()) as {
    data?: { joinWaitlist: boolean } | null;
    errors?: { extensions?: { code?: string } }[];
  };
}

afterEach(async () => {
  await db.delete(waitlistEntries).where(eq(waitlistEntries.email, email));
});

describe("joinWaitlist", () => {
  it("stores one normalized entry however often the address is submitted", async () => {
    const first = await joinWaitlist(`  ${email.toUpperCase()} `);
    const second = await joinWaitlist(email);

    expect(first.data?.joinWaitlist).toBe(true);
    expect(second.data?.joinWaitlist).toBe(true);
    const rows = await db
      .select({ email: waitlistEntries.email })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.email, email));
    expect(rows).toEqual([{ email }]);
  });

  it("rejects an address without a domain", async () => {
    const localPart = email.split("@")[0] ?? "";
    const body = await joinWaitlist(localPart);

    expect(body.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    const rows = await db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.email, localPart));
    expect(rows).toEqual([]);
  });
});

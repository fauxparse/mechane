import { eq, inArray } from "drizzle-orm";
import { createYoga } from "graphql-yoga";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "../db/client";
import { rateLimits, waitlistEntries } from "../db/schema";
import { createContext } from "./context";
import { schema } from "./schema";
import { WAITLIST_SIGNUPS_PER_WINDOW } from "./waitlist";

const run = crypto.randomUUID();
const email = `waitlist-test-${run}@example.com`;
const emailNumber = (n: number) => `waitlist-test-${run}-${n}@example.com`;

// A fresh /64 per test, in the IPv6 documentation range, so no test inherits
// another's attempts.
let network: string;

beforeEach(() => {
  const [a = 0, b = 0] = crypto.getRandomValues(new Uint16Array(2));
  network = `2001:db8:${a.toString(16)}:${b.toString(16)}`;
});

async function joinWaitlist(address: string, { host = "1", name = "Ada Lovelace" } = {}) {
  const yoga = createYoga({
    schema,
    context: ({ request }) => createContext(request),
    graphqlEndpoint: "/api/graphql",
    // A masked "Unexpected error." would hide which code the resolver chose.
    maskedErrors: false,
  });
  const response = await yoga.fetch("http://localhost/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `${network}::${host}` },
    body: JSON.stringify({
      query:
        "mutation ($name: String!, $email: String!) { joinWaitlist(name: $name, email: $email) }",
      variables: { name, email: address },
    }),
  });
  return (await response.json()) as {
    data?: { joinWaitlist: boolean } | null;
    errors?: { extensions?: { code?: string } }[];
  };
}

afterEach(async () => {
  const emails = [
    email,
    ...Array.from({ length: WAITLIST_SIGNUPS_PER_WINDOW + 1 }, (_, n) => emailNumber(n)),
  ];
  await db.delete(waitlistEntries).where(inArray(waitlistEntries.email, emails));
  await db.delete(rateLimits).where(eq(rateLimits.key, `${network}::/64`));
});

describe("joinWaitlist", () => {
  it("stores one normalized entry however often the address is submitted, keeping the first name", async () => {
    const first = await joinWaitlist(`  ${email.toUpperCase()} `, { name: "  Ada Lovelace " });
    const second = await joinWaitlist(email, { name: "Someone Else" });

    expect(first.data?.joinWaitlist).toBe(true);
    expect(second.data?.joinWaitlist).toBe(true);
    const rows = await db
      .select({ email: waitlistEntries.email, name: waitlistEntries.name })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.email, email));
    expect(rows).toEqual([{ email, name: "Ada Lovelace" }]);
  });

  it("rejects a blank name and stores nothing", async () => {
    const body = await joinWaitlist(email, { name: "   " });

    expect(body.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    const rows = await db.select().from(waitlistEntries).where(eq(waitlistEntries.email, email));
    expect(rows).toEqual([]);
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

  it("refuses a network past its limit, even from a new address in the same /64, and stores nothing", async () => {
    for (let n = 0; n < WAITLIST_SIGNUPS_PER_WINDOW; n += 1) {
      const body = await joinWaitlist(emailNumber(n), { host: n.toString(16) });
      expect(body.data?.joinWaitlist).toBe(true);
    }

    const refused = emailNumber(WAITLIST_SIGNUPS_PER_WINDOW);
    const body = await joinWaitlist(refused, { host: "ffff" });

    expect(body.errors?.[0]?.extensions?.code).toBe("RATE_LIMITED");
    const rows = await db.select().from(waitlistEntries).where(eq(waitlistEntries.email, refused));
    expect(rows).toEqual([]);
  });

  it("starts a new window once the last one lapses", async () => {
    for (let n = 0; n <= WAITLIST_SIGNUPS_PER_WINDOW; n += 1) await joinWaitlist(emailNumber(n));
    await db
      .update(rateLimits)
      .set({ windowStartedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
      .where(eq(rateLimits.key, `${network}::/64`));

    const body = await joinWaitlist(email);

    expect(body.data?.joinWaitlist).toBe(true);
  });
});

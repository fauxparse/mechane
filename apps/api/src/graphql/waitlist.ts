// The waitlist for prospective users, filled in from the holding page at the
// apex domain (apps/site). Public: joining needs no session.
//
// Sign-ups are rate limited per client network so a script can't fill the
// table with junk. The counter lives in Postgres because the API runs as
// Vercel functions: an in-memory count resets with each instance and isn't
// shared between them, and Better Auth's limiter only sees /api/auth/*.
// Vercel Firewall rules can't tell this mutation from other GraphQL traffic.
// There is no per-email-domain limit: real sign-ups cluster on a few shared
// providers, and a script can use any domain it controls.
import { lt, sql } from "drizzle-orm";
import { GraphQLError } from "graphql";

import { db } from "../db/client";
import { waitlistEntries, waitlistRateLimits } from "../db/schema";
import type { Resolvers } from "./context";

/** Sign-ups one client network may attempt per window. */
export const WAITLIST_SIGNUPS_PER_WINDOW = 10;
const WINDOW = sql`interval '1 hour'`;
// Requests with no usable client address share one bucket rather than going
// unlimited. Production always has one (see ../lib/client-address.ts).
const UNKNOWN_CLIENT = "unknown";

// RFC 5321 caps a forward path at 256 octets including the angle brackets.
const MAX_EMAIL_LENGTH = 254;
// Deliberately loose: one "@", no whitespace, a dot in the domain. Whether
// the mailbox exists is only knowable by writing to it.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizedEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new GraphQLError("Enter a valid email address.", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return email;
}

/**
 * Counts one attempt against `client`'s window, refusing it past the limit.
 * Deleting lapsed windows first is also what resets a returning client: its
 * old row is gone, so the upsert starts a new window at one attempt.
 */
async function assertWithinRateLimit(client: string): Promise<void> {
  await db
    .delete(waitlistRateLimits)
    .where(lt(waitlistRateLimits.windowStartedAt, sql`now() - ${WINDOW}`));
  const [bucket] = await db
    .insert(waitlistRateLimits)
    .values({ clientAddress: client })
    .onConflictDoUpdate({
      target: waitlistRateLimits.clientAddress,
      set: { attempts: sql`${waitlistRateLimits.attempts} + 1` },
    })
    .returning({ attempts: waitlistRateLimits.attempts });
  if (bucket && bucket.attempts > WAITLIST_SIGNUPS_PER_WINDOW) {
    throw new GraphQLError("Too many sign-ups from your network. Try again in an hour.", {
      extensions: { code: "RATE_LIMITED" },
    });
  }
}

export const typeDefs = /* GraphQL */ `
  type Mutation {
    """
    Adds an email address to the waitlist. Always true on success, including
    when the address is already listed, so the response does not reveal who
    else has signed up. Refused with the RATE_LIMITED error code once one
    client network has made too many attempts within the hour.
    """
    joinWaitlist(email: String!): Boolean!
  }
`;

export const resolvers: Resolvers = {
  Mutation: {
    joinWaitlist: async (_parent, { email }: { email: string }, context) => {
      const address = normalizedEmail(email);
      await assertWithinRateLimit(context.clientAddress ?? UNKNOWN_CLIENT);
      await db.insert(waitlistEntries).values({ email: address }).onConflictDoNothing();
      return true;
    },
  },
};

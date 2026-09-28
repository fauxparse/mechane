// The waitlist for prospective users, filled in from the holding page at the
// apex domain (apps/site). Public: joining needs no session.
//
// Sign-ups are rate limited per client network (see ../lib/rate-limit.ts) so
// a script can't fill the table with junk. Vercel Firewall rules can't tell
// this mutation from other GraphQL traffic.
// There is no per-email-domain limit: real sign-ups cluster on a few shared
// providers, and a script can use any domain it controls.
import { GraphQLError } from "graphql";

import { db } from "../db/client";
import { waitlistEntries } from "../db/schema";
import { assertWithinRateLimit, type RateLimitBucket } from "../lib/rate-limit";
import type { Resolvers } from "./context";

/** Sign-ups one client network may attempt per window. */
export const WAITLIST_SIGNUPS_PER_WINDOW = 10;
const WAITLIST_SIGNUPS: RateLimitBucket = {
  name: "waitlist-signups",
  limit: WAITLIST_SIGNUPS_PER_WINDOW,
  windowSeconds: 60 * 60,
};
// Requests with no usable client address share one key rather than going
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

// Generous for any real name; only bounds what one request can store.
const MAX_NAME_LENGTH = 200;

function trimmedName(value: string): string {
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    throw new GraphQLError("Enter your name.", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return name;
}

export const typeDefs = /* GraphQL */ `
  type Mutation {
    """
    Adds a person to the waitlist. Always true on success, including when the
    address is already listed, so the response does not reveal who else has
    signed up; a repeat sign-up keeps the name given first, so knowing an
    address is not enough to rename its entry. Refused with the RATE_LIMITED
    error code once one client network has made too many attempts within the
    hour.
    """
    joinWaitlist(name: String!, email: String!): Boolean!
  }
`;

export const resolvers: Resolvers = {
  Mutation: {
    joinWaitlist: async (_parent, { name, email }: { name: string; email: string }, context) => {
      const entry = { name: trimmedName(name), email: normalizedEmail(email) };
      await assertWithinRateLimit(
        WAITLIST_SIGNUPS,
        context.clientAddress ?? UNKNOWN_CLIENT,
        "Too many sign-ups from your network. Try again in an hour.",
      );
      await db.insert(waitlistEntries).values(entry).onConflictDoNothing();
      return true;
    },
  },
};

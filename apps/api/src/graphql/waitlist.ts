// The waitlist for prospective users, filled in from the holding page at the
// apex domain (apps/site). Public: joining needs no session.
import { GraphQLError } from "graphql";

import { db } from "../db/client";
import { waitlistEntries } from "../db/schema";
import type { Resolvers } from "./context";

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

export const typeDefs = /* GraphQL */ `
  type Mutation {
    """
    Adds an email address to the waitlist. Always true on success, including
    when the address is already listed, so the response does not reveal who
    else has signed up.
    """
    joinWaitlist(email: String!): Boolean!
  }
`;

export const resolvers: Resolvers = {
  Mutation: {
    joinWaitlist: async (_parent, { email }: { email: string }) => {
      await db
        .insert(waitlistEntries)
        .values({ email: normalizedEmail(email) })
        .onConflictDoNothing();
      return true;
    },
  },
};

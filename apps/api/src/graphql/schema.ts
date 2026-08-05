// GraphQL schema. `me` proves a signed-in user is resolvable in the
// resolver layer; the Show query/mutations (issue #3) are the first real
// owned-resource vertical slice, using `requireUserId` (./context.ts) and
// `assertOwnedBy`/`assertValidShowName` (@presence/domain) the same way
// every later owned resource (Scene, Device, ...) should.
import { assertOwnedBy, assertValidShowName, InvalidShowNameError } from "@presence/domain";
import { and, eq } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { createSchema } from "graphql-yoga";

import { db } from "../db/client";
import { shows } from "../db/schema";
import { requireUserId } from "./context";
import type { GraphQLContext } from "./context";

// graphql-yoga masks any thrown error that isn't a GraphQLError as a generic
// "Unexpected error" (sound default — it stops internal error messages
// leaking to clients). @presence/domain's validation errors are plain
// Errors so they stay usable outside a GraphQL context, so translate them
// here into a GraphQLError the client can actually read.
function validShowName(name: string): string {
  try {
    return assertValidShowName(name);
  } catch (error) {
    if (error instanceof InvalidShowNameError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

async function findOwnShowOrThrow(id: string, userId: string) {
  const [show] = await db.select().from(shows).where(eq(shows.id, id));
  if (!show) {
    throw new GraphQLError("Show not found.", { extensions: { code: "NOT_FOUND" } });
  }
  // assertOwnedBy throws NotOwnerError, which reads as "not found" to the
  // caller rather than confirming a Show with this id exists for someone
  // else — a user must not be able to see or mutate another user's Shows.
  try {
    return assertOwnedBy(show, userId);
  } catch {
    throw new GraphQLError("Show not found.", { extensions: { code: "NOT_FOUND" } });
  }
}

export const schema = createSchema<GraphQLContext>({
  typeDefs: /* GraphQL */ `
    type User {
      id: ID!
      name: String!
      email: String!
      emailVerified: Boolean!
    }

    type Show {
      id: ID!
      name: String!
      createdAt: String!
      updatedAt: String!
    }

    type Query {
      "The signed-in user, or null if the request has no valid session."
      me: User
      "The signed-in user's own Shows, most recently updated first."
      shows: [Show!]!
      "A single Show owned by the signed-in user, or null if it doesn't exist or isn't theirs."
      show(id: ID!): Show
    }

    type Mutation {
      "Creates a new Show owned by the signed-in user."
      createShow(name: String!): Show!
      "Renames a Show owned by the signed-in user."
      renameShow(id: ID!, name: String!): Show!
      "Deletes a Show owned by the signed-in user. Returns true on success."
      deleteShow(id: ID!): Boolean!
    }
  `,
  resolvers: {
    Query: {
      me: (_parent, _args, context) => context.user,
      shows: async (_parent, _args, context) => {
        const userId = requireUserId(context);
        return db.select().from(shows).where(eq(shows.userId, userId)).orderBy(shows.updatedAt);
      },
      show: async (_parent, { id }: { id: string }, context) => {
        const userId = requireUserId(context);
        const [show] = await db
          .select()
          .from(shows)
          .where(and(eq(shows.id, id), eq(shows.userId, userId)));
        return show ?? null;
      },
    },
    Mutation: {
      createShow: async (_parent, { name }: { name: string }, context) => {
        const userId = requireUserId(context);
        const validName = validShowName(name);
        const [show] = await db.insert(shows).values({ name: validName, userId }).returning();
        return show;
      },
      renameShow: async (_parent, { id, name }: { id: string; name: string }, context) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(id, userId);
        const validName = validShowName(name);
        const [updated] = await db
          .update(shows)
          .set({ name: validName, updatedAt: new Date() })
          .where(eq(shows.id, id))
          .returning();
        return updated;
      },
      deleteShow: async (_parent, { id }: { id: string }, context) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(id, userId);
        await db.delete(shows).where(eq(shows.id, id));
        return true;
      },
    },
  },
});

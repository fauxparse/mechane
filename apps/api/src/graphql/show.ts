// The Show slice: a signed-in user's Shows (issue #3), the first real
// owned-resource vertical — using `requireUserId` (./context.ts) and
// `assertOwnedBy` (@mechane/domain) the way every later owned resource
// (Scene, Device, ...) should.
//
// It also owns the two pieces of Show-scope policy every other slice's
// Show-scoped reads and mutations share: proving the caller owns the Show
// they named (`findOwnShowOrThrow`), and which half of it — draft or
// published — a `state` argument asks for (`validGraphState`).
import { assertOwnedBy } from "@mechane/domain/ownership";
import {
  assertValidGraphState,
  InvalidGraphStateError,
  type GraphState,
} from "@mechane/domain/graph";
import { assertValidShowName, InvalidShowNameError } from "@mechane/domain/show";
import { isId } from "@mechane/domain/id";
import { and, eq } from "drizzle-orm";
import { GraphQLError } from "graphql";

import { db } from "../db/client";
import { shows } from "../db/schema";
import { createShowWithDefaults } from "../db/show-graph";
import type { Resolvers } from "./context";
import { requireUserId } from "./context";

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

export function validGraphState(value: string): GraphState {
  try {
    return assertValidGraphState(value);
  } catch (error) {
    if (error instanceof InvalidGraphStateError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

export async function findOwnShowOrThrow(id: string, userId: string) {
  // A malformed id can't match any row, so don't ask the database — but
  // report it the same way a missing row is reported, since telling the
  // client "that's not even a valid Show id" is information about the id
  // format they don't need from a mutation.
  if (!isId("show", id)) {
    throw new GraphQLError("Show not found.", { extensions: { code: "NOT_FOUND" } });
  }
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

export const typeDefs = /* GraphQL */ `
    type Show {
      id: ID!
      name: String!
      createdAt: String!
      updatedAt: String!
    }

    type Query {
      "The signed-in user's own Shows, most recently updated first."
      shows: [Show!]!
      "A single Show owned by the signed-in user, or null if it doesn't exist or isn't theirs."
      show(id: ID!): Show
    }

    type Mutation {
      createShow(name: String!): Show!
      renameShow(id: ID!, name: String!): Show!
      deleteShow(id: ID!): Boolean!
    }
`;

export const resolvers: Resolvers = {
  Show: {
    createdAt: (show: Pick<typeof shows.$inferSelect, "createdAt">) =>
      show.createdAt.toISOString(),
    updatedAt: (show: Pick<typeof shows.$inferSelect, "updatedAt">) =>
      show.updatedAt.toISOString(),
  },
  Query: {
    shows: async (_parent, _args, context) => {
      const userId = requireUserId(context);
      return db.select().from(shows).where(eq(shows.userId, userId)).orderBy(shows.updatedAt);
    },
    show: async (_parent, { id }: { id: string }, context) => {
      const userId = requireUserId(context);
      // Same reasoning as `findOwnShowOrThrow`: a malformed id is just a
      // miss, and this query already returns null for "not yours".
      if (!isId("show", id)) return null;
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
      return createShowWithDefaults(validName, userId);
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
};

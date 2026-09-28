// The admin slice (issue #826): what the Studio admin area needs beyond Better
// Auth's own `/api/auth/admin/*` endpoints, which already cover the accounts
// themselves (listing, roles, bans, removal). Users' Shows are Mechanē data,
// so reading and deleting them on someone else's behalf lives here.
//
// Every field is gated by a role permission (`requirePermission`), never by
// ownership: an admin acts on Shows they do not own. The Show slice's own
// fields stay ownership-only (docs/adr/0022-role-based-authorization.md).
import { isId } from "@mechane/domain/id";
import { desc, eq } from "drizzle-orm";
import { GraphQLError } from "graphql";

import { db } from "../db/client";
import { shows } from "../db/schema";
import type { Resolvers } from "./context";
import { requirePermission } from "./context";

export const typeDefs = /* GraphQL */ `
  type Query {
    "Every Show the given user owns, most recently updated first. Requires the show:list permission."
    userShows(userId: ID!): [Show!]!
  }

  type Mutation {
    "Deletes any user's Show. Requires the show:delete permission."
    adminDeleteShow(id: ID!): Boolean!
  }
`;

export const resolvers: Resolvers = {
  Query: {
    userShows: async (_parent, { userId }: { userId: string }, context) => {
      await requirePermission(context, { show: ["list"] });
      return db.select().from(shows).where(eq(shows.userId, userId)).orderBy(desc(shows.updatedAt));
    },
  },
  Mutation: {
    adminDeleteShow: async (_parent, { id }: { id: string }, context) => {
      await requirePermission(context, { show: ["delete"] });
      const deleted = isId("show", id)
        ? await db.delete(shows).where(eq(shows.id, id)).returning({ id: shows.id })
        : [];
      if (deleted.length === 0) {
        throw new GraphQLError("Show not found.", { extensions: { code: "NOT_FOUND" } });
      }
      return true;
    },
  },
};

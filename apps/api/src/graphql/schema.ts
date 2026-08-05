// Minimal GraphQL schema for this ticket: just enough to prove a signed-in
// user is resolvable in the resolver layer. Show/Scene/etc. types and
// resolvers land in later tickets, using `requireUserId` (./context.ts) and
// `assertOwnedBy` (@presence/domain) the same way `me` does here.
import { createSchema } from "graphql-yoga";

import type { GraphQLContext } from "./context";

export const schema = createSchema<GraphQLContext>({
  typeDefs: /* GraphQL */ `
    type User {
      id: ID!
      name: String!
      email: String!
      emailVerified: Boolean!
    }

    type Query {
      "The signed-in user, or null if the request has no valid session."
      me: User
    }
  `,
  resolvers: {
    Query: {
      me: (_parent, _args, context) => context.user,
    },
  },
});

// Typed admin documents (issue #826): any user's Shows, for the Studio admin
// area. The accounts themselves come from Better Auth's admin endpoints, not
// GraphQL — see apps/api/src/graphql/admin.ts.
import { graphql } from "./graphql";
import type { ResultOf } from "gql.tada";

export const UserShowsQuery = graphql(`
  query UserShows($userId: ID!) {
    userShows(userId: $userId) {
      id
      name
      createdAt
      updatedAt
    }
  }
`);

export const AdminDeleteShowMutation = graphql(`
  mutation AdminDeleteShow($id: ID!) {
    adminDeleteShow(id: $id)
  }
`);

export type UserShow = ResultOf<typeof UserShowsQuery>["userShows"][number];

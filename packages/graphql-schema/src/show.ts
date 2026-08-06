// Typed Show query/mutation documents (issue #15), replacing the
// hand-mirrored raw-string operations this package used before gql.tada was
// wired up. Each document selects the same field set directly (no
// fragment) since gql.tada's fragment masking would otherwise force every
// caller to unwrap via `readFragment` for no benefit at this field count —
// see apps/api/src/graphql/schema.ts for the server-side Show type these
// mirror. `Show` is derived from a query's own result type rather than
// hand-mirrored, so it can't drift from the fields actually selected below.
import { graphql } from "./graphql";
import type { ResultOf } from "gql.tada";

export const ListShowsQuery = graphql(`
  query ListShows {
    shows {
      id
      name
      createdAt
      updatedAt
    }
  }
`);

export const GetShowQuery = graphql(`
  query GetShow($id: ID!) {
    show(id: $id) {
      id
      name
      createdAt
      updatedAt
    }
  }
`);

export const CreateShowMutation = graphql(`
  mutation CreateShow($name: String!) {
    createShow(name: $name) {
      id
      name
      createdAt
      updatedAt
    }
  }
`);

export const RenameShowMutation = graphql(`
  mutation RenameShow($id: ID!, $name: String!) {
    renameShow(id: $id, name: $name) {
      id
      name
      createdAt
      updatedAt
    }
  }
`);

export const DeleteShowMutation = graphql(`
  mutation DeleteShow($id: ID!) {
    deleteShow(id: $id)
  }
`);

export type Show = NonNullable<ResultOf<typeof GetShowQuery>["show"]>;

// Client-side mirror of the Show type in apps/api/src/graphql/schema.ts.
// Hand-written until a codegen tool is chosen (see client.ts) — keep this in
// sync with the server typeDefs when the Show type changes.
export interface Show {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export const SHOW_FIELDS = /* GraphQL */ `
  id
  name
  createdAt
  updatedAt
`;

export const LIST_SHOWS_QUERY = /* GraphQL */ `
  query ListShows {
    shows {
      ${SHOW_FIELDS}
    }
  }
`;

export const GET_SHOW_QUERY = /* GraphQL */ `
  query GetShow($id: ID!) {
    show(id: $id) {
      ${SHOW_FIELDS}
    }
  }
`;

export const CREATE_SHOW_MUTATION = /* GraphQL */ `
  mutation CreateShow($name: String!) {
    createShow(name: $name) {
      ${SHOW_FIELDS}
    }
  }
`;

export const RENAME_SHOW_MUTATION = /* GraphQL */ `
  mutation RenameShow($id: ID!, $name: String!) {
    renameShow(id: $id, name: $name) {
      ${SHOW_FIELDS}
    }
  }
`;

export const DELETE_SHOW_MUTATION = /* GraphQL */ `
  mutation DeleteShow($id: ID!) {
    deleteShow(id: $id)
  }
`;

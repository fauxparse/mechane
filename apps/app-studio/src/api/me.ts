// Whether anyone is signed in. Sign-in/sign-up UI is a separate ticket —
// this is just enough to let the Show screens tell a signed-out visitor
// why their Shows aren't loading, instead of showing a raw GraphQL error.
import { graphqlRequest } from "@presence/graphql-schema";
import { useQuery } from "@tanstack/react-query";

import { GRAPHQL_ENDPOINT } from "./client";

interface Me {
  id: string;
  name: string;
  email: string;
}

const ME_QUERY = /* GraphQL */ `
  query Me {
    me {
      id
      name
      email
    }
  }
`;

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const data = await graphqlRequest<{ me: Me | null }>(GRAPHQL_ENDPOINT, ME_QUERY);
      return data.me;
    },
  });
}

// Whether anyone is signed in. Sign-in/sign-up UI is a separate ticket —
// this is just enough to let the Show screens tell a signed-out visitor
// why their Shows aren't loading, instead of showing a raw GraphQL error.
import { graphqlRequest, MeQuery } from "@presence/graphql-schema";
import { useQuery } from "@tanstack/react-query";

import { GRAPHQL_ENDPOINT } from "./client";

export const meQueryKey = ["me"] as const;

export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async () => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, MeQuery);
      return data.me;
    },
  });
}

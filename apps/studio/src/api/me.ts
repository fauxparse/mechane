// Whether anyone is signed in. Backs both the router's `beforeLoad` auth
// guards (issue #30) and any in-route reads of the signed-in user. While an
// admin is impersonating someone (issue #845), the signed-in user is the one
// being impersonated, and `impersonator` names the admin.
import type { Impersonator, Me } from "@mechane/graphql-schema";
import { graphqlRequest, MeQuery } from "@mechane/graphql-schema";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

import { GRAPHQL_ENDPOINT } from "./client";

export const meQueryKey = ["me"] as const;

export type SignedInUser = Me & { impersonator: Impersonator | null };

// A short staleTime so the authenticated/guest layout routes' `beforeLoad`
// (which runs on every navigation, including back/forward and preloads)
// doesn't refetch on each nav — just once the cached value goes stale.
export function meQueryOptions(): UseQueryOptions<
  SignedInUser | null,
  Error,
  SignedInUser | null,
  typeof meQueryKey
> {
  return {
    queryKey: meQueryKey,
    queryFn: async () => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, MeQuery);
      return data.me ? { ...data.me, impersonator: data.impersonator } : null;
    },
    staleTime: 60_000,
  };
}

export function useMe() {
  return useQuery(meQueryOptions());
}

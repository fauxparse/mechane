// TanStack Query hooks over the Custom Domain owner operations (#835). One
// query holds every domain the user has; Show settings and the Share dialog
// each take the slice they need. They read a Device's address from these
// domains rather than the Show graph, which isn't refetched under an open
// editor's command stack.
import {
  AddCustomDomainMutation,
  BindCustomDomainMutation,
  CheckCustomDomainNowMutation,
  CustomDomainFields,
  CustomDomainsQuery,
  graphqlRequest,
  readFragment,
  RemoveCustomDomainMutation,
  UnbindCustomDomainMutation,
  type CustomDomain,
} from "@mechane/graphql-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { GRAPHQL_ENDPOINT } from "./client";

export const customDomainsQueryKey = ["customDomains"] as const;

/** Every Custom Domain the user has, and those bound to no Device. */
export function useCustomDomains() {
  return useQuery({
    queryKey: customDomainsQueryKey,
    queryFn: async (): Promise<{
      customDomains: readonly CustomDomain[];
      unboundCustomDomains: readonly CustomDomain[];
    }> => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, CustomDomainsQuery, {});
      return {
        customDomains: readFragment(CustomDomainFields, data.customDomains),
        unboundCustomDomains: readFragment(CustomDomainFields, data.unboundCustomDomains),
      };
    },
    // Statuses move on the server's schedule, so a visible list follows.
    refetchInterval: 15_000,
  });
}

export function useCustomDomainMutations() {
  const queryClient = useQueryClient();
  const onSuccess = () => void queryClient.invalidateQueries({ queryKey: customDomainsQueryKey });
  const add = useMutation({
    mutationFn: (input: { hostname: string; showId: string; deviceId: string }) =>
      graphqlRequest(GRAPHQL_ENDPOINT, AddCustomDomainMutation, input),
    onSuccess,
  });
  const bind = useMutation({
    mutationFn: (input: { id: string; showId: string; deviceId: string }) =>
      graphqlRequest(GRAPHQL_ENDPOINT, BindCustomDomainMutation, input),
    onSuccess,
  });
  const unbind = useMutation({
    mutationFn: (id: string) =>
      graphqlRequest(GRAPHQL_ENDPOINT, UnbindCustomDomainMutation, { id }),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      graphqlRequest(GRAPHQL_ENDPOINT, RemoveCustomDomainMutation, { id }),
    onSuccess,
  });
  const checkNow = useMutation({
    mutationFn: (id: string) =>
      graphqlRequest(GRAPHQL_ENDPOINT, CheckCustomDomainNowMutation, { id }),
    onSuccess,
  });
  return { add, bind, unbind, remove, checkNow };
}

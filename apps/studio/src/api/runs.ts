import type { ShowId } from "@mechane/domain";
import {
  EndRunMutation,
  GetActiveRunQuery,
  graphqlRequest,
  StartRunMutation,
} from "@mechane/graphql-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { GRAPHQL_ENDPOINT } from "./client";

export const activeRunQueryKey = (showId: ShowId) => ["shows", showId, "active-run"] as const;

export function useActiveRun(showId: ShowId | null) {
  return useQuery({
    queryKey: activeRunQueryKey(showId ?? ("" as ShowId)),
    enabled: showId !== null,
    queryFn: async () => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, GetActiveRunQuery, {
        showId: showId as ShowId,
      });
      return data.activeRun;
    },
  });
}

export function useStartRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (showId: ShowId) => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, StartRunMutation, { showId });
      return data.startRun;
    },
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: activeRunQueryKey(run.showId as ShowId) });
    },
  });
}

export function useEndRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (showId: ShowId) => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, EndRunMutation, { showId });
      return data.endRun;
    },
    onSuccess: (_run, showId) => {
      void queryClient.invalidateQueries({ queryKey: activeRunQueryKey(showId) });
    },
  });
}

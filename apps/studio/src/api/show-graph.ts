// TanStack Query hooks over the Show-graph GraphQL operations (issue #38),
// following ./shows.ts: the route components see data and mutation
// callbacks, not documents and endpoints.
//
// The editor chrome (issue #39) needs *both* states of the graph, because
// "are there unpublished changes?" is derived by comparing their
// timestamps (ADR-0002 — see @presence/domain's `publishState`), not
// stored on either.
import type { GraphState, ShowId } from "@presence/domain";
import {
  GetShowGraphQuery,
  graphqlRequest,
  PublishShowGraphMutation,
} from "@presence/graphql-schema";
import type { ShowGraph } from "@presence/graphql-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { GRAPHQL_ENDPOINT } from "./client";

export const showGraphQueryKey = (id: ShowId, state: GraphState) =>
  ["shows", id, "graph", state] as const;

/**
 * A Show's graph in one state. `id` is nullable for the same reason as
 * `useShow`'s: a route can hand over an id it couldn't validate without
 * faking one, and the request is skipped rather than made and missed.
 */
export function useShowGraph(id: ShowId | null, state: GraphState) {
  return useQuery({
    queryKey: showGraphQueryKey(id ?? ("" as ShowId), state),
    enabled: id !== null,
    queryFn: async () => {
      // `enabled` above means this only runs with a non-null id.
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, GetShowGraphQuery, {
        showId: id as ShowId,
        state,
      });
      return data.showGraph;
    },
  });
}

/**
 * Publishes a Show's draft graph (ADR-0002: immediate cutover, whole Show).
 * The draft is deliberately left alone by the server, so only the published
 * graph's cache entry is refreshed — the badge flips because the published
 * timestamp moved past the draft's, not because the draft changed.
 */
export function usePublishShowGraph() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (showId: ShowId) => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, PublishShowGraphMutation, { showId });
      return data.publishShowGraph;
    },
    onSuccess: (graph) => {
      const showId = graph.showId as ShowId;
      queryClient.setQueryData(
        showGraphQueryKey(showId, "published"),
        (previous: ShowGraph | undefined) =>
          // The publish mutation only selects the metadata, so keep
          // whatever nodes/edges the cache already had rather than
          // blanking a populated graph. It's a copy of the draft either
          // way; the invalidate below fetches the real thing.
          previous ? { ...previous, ...graph } : undefined,
      );
      void queryClient.invalidateQueries({
        queryKey: showGraphQueryKey(showId, "published"),
      });
    },
  });
}

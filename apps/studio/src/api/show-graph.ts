// TanStack Query hooks over the Show-graph GraphQL operations (issue #38),
// following ./shows.ts: the route components see data and mutation
// callbacks, not documents and endpoints.
//
// The editor chrome (issue #39) needs *both* states of the graph, because
// "are there unpublished changes?" is derived by comparing their
// timestamps (ADR-0002 — see @presence/domain's `publishState`), not
// stored on either.
import type { GraphState, ShowGraph as DomainShowGraph, ShowId } from "@presence/domain";
import {
  GetShowGraphQuery,
  graphqlRequest,
  PublishShowGraphMutation,
  SaveShowGraphMutation,
} from "@presence/graphql-schema";
import type { ShowGraph } from "@presence/graphql-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { toGraphInput } from "../editors/show/api-graph";
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

/**
 * Saves a Show's draft graph (issue #42). Whole-graph replacement, matching the
 * server's own unit of work (`writeShowGraph`) — the editor's commands are
 * fine-grained, the write is not, and that's deliberate: a command's inverse is
 * how a change is undone, not a diff the server has to reconcile.
 *
 * The draft graph's *cache entry* is refreshed from the response so the
 * "unpublished changes" badge (ADR-0002 derives it from timestamps) moves, but
 * the editor deliberately doesn't re-read it — see the route's note on why the
 * graph it opens with is the graph it keeps editing.
 */
export function useSaveShowGraph() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ showId, graph }: { showId: ShowId; graph: DomainShowGraph }) => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, SaveShowGraphMutation, {
        showId,
        graph: toGraphInput(graph),
      });
      return data.saveShowGraph;
    },
    onSuccess: (graph) => {
      queryClient.setQueryData(showGraphQueryKey(graph.showId as ShowId, "draft"), graph);
    },
  });
}

/** How long editing has to pause before the draft is written. */
const SAVE_DEBOUNCE_MS = 700;

/**
 * A save that waits for a gap in the editing. Commands land per gesture (#28),
 * which is already the right *granularity* for undo but far too chatty for a
 * whole-graph write — dragging four nodes in a row would be four writes of the
 * entire Show.
 *
 * The latest graph wins: an intermediate state that never got written is one
 * nobody asked to keep, since every write replaces the whole graph anyway.
 */
export function useDebouncedShowGraphSave(showId: ShowId | null) {
  const save = useSaveShowGraph();
  const pending = useRef<DomainShowGraph | null>(null);
  const timer = useRef<number | null>(null);

  const flush = useCallback(() => {
    timer.current = null;
    const graph = pending.current;
    pending.current = null;
    if (!graph || !showId) return;
    save.mutate({ showId, graph });
  }, [save, showId]);

  // A pending edit outliving the editor would be an edit silently dropped, so
  // unmounting writes it rather than cancelling it.
  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        flush();
      }
    },
    [flush],
  );

  const scheduleSave = useCallback(
    (graph: DomainShowGraph) => {
      pending.current = graph;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  return { scheduleSave, saving: save.isPending, error: save.error };
}

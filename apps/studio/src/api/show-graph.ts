// TanStack Query hooks over the Show-graph GraphQL operations (issue #38),
// following ./shows.ts: the route components see data and mutation
// callbacks, not documents and endpoints.
//
// The editor chrome (issue #39) needs *both* states of the graph, because
// "are there unpublished changes?" is derived by comparing their
// timestamps (ADR-0002 — see @mechane/domain's `publishState`), not
// stored on either.
import { coalesceGraphEdits } from "@mechane/commands";
import type { GraphEdit } from "@mechane/commands";
import type { GraphState, ShowId } from "@mechane/domain";
import {
  ApplyShowGraphEditsMutation,
  GetShowGraphQuery,
  graphqlRequest,
  PublishShowGraphMutation,
} from "@mechane/graphql-schema";
import type { ShowGraph } from "@mechane/graphql-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { toEditInput } from "../editors/show/data/api-graph";
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

/** How long editing has to pause before the pending edits are sent. */
const SAVE_DEBOUNCE_MS = 700;

export interface ShowGraphEdits {
  /**
   * Queues edits for the next flush. Called once per landed command — a
   * gesture included, since the stack coalesces one (#28).
   */
  enqueue(edits: readonly GraphEdit[]): void;
  /** True while a batch is in flight. */
  saving: boolean;
  /**
   * Set when a batch was refused. The editor keeps working from its own
   * state, but nothing further is sent — see below for why that's the
   * honest behaviour rather than a retry loop.
   */
  error: Error | null;
}

/**
 * The draft graph's write path (issue #103): a queue of edits, flushed after a
 * pause in the editing.
 *
 * What replaced what: this used to hold *the latest graph*, because every
 * write replaced the whole thing and an intermediate state nobody had written
 * was one nobody wanted. Edits are the opposite — each one is a step, and a
 * step that never arrives leaves the server on a different graph from the
 * client. So they accumulate rather than overwrite, and the debounce is now
 * about *batching* rather than about discarding.
 *
 * One batch is in flight at a time, in order. Edits are relative to the graph
 * before them, so two batches racing would be two batches composed against the
 * same version, and the second would be refused — correctly, but avoidably.
 *
 * `baseVersion` seeds the version the first batch is composed against; after
 * that every response says what the next one should use.
 */
export function useShowGraphEdits(
  showId: ShowId | null,
  baseVersion: number | undefined,
): ShowGraphEdits {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const pending = useRef<GraphEdit[]>([]);
  const timer = useRef<number | null>(null);
  const inFlight = useRef(false);
  // Not state: the version is a fact about the last response, and re-rendering
  // on it would re-render the editor for something it never displays.
  const version = useRef<number | null>(null);
  const failed = useRef(false);

  useEffect(() => {
    if (version.current === null && baseVersion !== undefined) version.current = baseVersion;
  }, [baseVersion]);

  const flush = useCallback(() => {
    timer.current = null;
    if (inFlight.current || failed.current) return;
    // Coalesced here, at the wire, rather than as they arrive: a batch is
    // only knowable as a whole, and two drags of the same node inside one
    // debounce window collapse for the same reason one drag's frames do.
    const edits = coalesceGraphEdits(pending.current);
    const base = version.current;
    if (edits.length === 0 || !showId || base === null) return;
    pending.current = [];
    inFlight.current = true;
    setSaving(true);
    graphqlRequest(GRAPHQL_ENDPOINT, ApplyShowGraphEditsMutation, {
      showId,
      baseVersion: base,
      edits: edits.map(toEditInput),
    })
      .then((data) => {
        const graph = data.applyShowGraphEdits;
        version.current = graph.version;
        // The badge is derived from the two graphs' timestamps (ADR-0002), so
        // the cache entry is refreshed for that — not so the editor re-reads
        // it. See the route's note on why the graph it opens with is the
        // graph it keeps editing.
        queryClient.setQueryData(showGraphQueryKey(graph.showId as ShowId, "draft"), graph);
      })
      .catch((reason: unknown) => {
        // No retry, and no putting the edits back in the queue to be sent
        // after the ones that follow them. A refused batch means the server
        // is on a graph these edits weren't composed against — sending more
        // of them would build on a divergence rather than close it. Stopping
        // and saying so is the recoverable state; reloading re-reads the
        // draft, which is where recovery actually lives until #103's
        // follow-up gives the editor something better to do about it.
        failed.current = true;
        setError(reason instanceof Error ? reason : new Error(String(reason)));
      })
      .finally(() => {
        inFlight.current = false;
        setSaving(false);
        // Anything queued while that was in flight goes now, in order.
        if (pending.current.length > 0 && !failed.current) flush();
      });
  }, [queryClient, showId]);

  // A pending edit outliving the editor would be an edit silently dropped, so
  // unmounting sends it rather than cancelling it.
  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        flush();
      }
    },
    [flush],
  );

  const enqueue = useCallback(
    (edits: readonly GraphEdit[]) => {
      if (edits.length === 0) return;
      pending.current.push(...edits);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  return { enqueue, saving, error };
}

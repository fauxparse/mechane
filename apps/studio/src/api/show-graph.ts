// TanStack Query hooks over the Show-graph GraphQL operations (issue #38),
// following ./shows.ts: the route components see data and mutation
// callbacks, not documents and endpoints.
//
// The editor chrome (issue #39) needs *both* states of the graph, because
// "are there unpublished changes?" is derived by comparing their
// timestamps (ADR-0002 — see @mechane/domain's `publishState`), not
// stored on either.
import { coalesceCanvasWorkspaceEdits, coalesceGraphEdits } from "@mechane/commands";
import type { CanvasWorkspaceEdit, GraphEdit } from "@mechane/commands";
import type { GraphState, ShowId } from "@mechane/domain";
import {
  ApplyShowEditsMutation,
  GetShowGraphQuery,
  graphqlRequest,
  PublishShowGraphMutation,
} from "@mechane/graphql-schema";
import type { ShowGraph } from "@mechane/graphql-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { toEditInput, toGraphEdit } from "../editors/show/data/api-graph";
import { GRAPHQL_ENDPOINT } from "./client";

export const showGraphQueryKey = (id: ShowId, state: GraphState) =>
  ["shows", id, "graph", state] as const;

/**
 * Applies cache-safe graph edits without replacing the editor's command-stack
 * snapshot. Reordering only changes the Variable array on the addressed Scene.
 */
export function patchShowGraphQueryData(
  previous: ShowGraph | undefined,
  edits: readonly GraphEdit[],
): ShowGraph | undefined {
  if (!previous) return previous;
  let changed = false;
  const nodes = previous.nodes.map((node) => {
    if (node.__typename !== "SceneNode") return node;
    let variables = node.variables;
    for (const edit of edits) {
      if (edit.type !== "graph.reorderSceneVariables" || edit.sceneId !== node.id) continue;
      const variablesById = new Map(variables.map((variable) => [variable.id, variable]));
      const nextVariables = edit.variableIds.map((variableId, index) => {
        const variable = variablesById.get(variableId);
        return variable ? { ...variable, rank: String(index).padStart(10, "0") } : undefined;
      });
      if (nextVariables.some((variable) => variable === undefined)) return node;
      variables = nextVariables as typeof variables;
    }
    if (variables === node.variables) return node;
    changed = true;
    return { ...node, variables };
  });
  return changed ? { ...previous, nodes } : previous;
}

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

export interface ShowGraphEditsOptions {
  /**
   * Called with the edits the server made that the client didn't ask for
   * (#111) — a Device's minted pairing code, today. The editor applies these
   * to the graph it is editing; nobody else can, because nobody else has it.
   */
  onAmend?(edits: readonly GraphEdit[]): void;
}

export interface ShowGraphEdits {
  /**
   * Queues edits for the next flush. Called once per landed command — a
   * gesture included, since the stack coalesces one (#28).
   */
  enqueue(edits: readonly (GraphEdit | CanvasWorkspaceEdit)[]): void;
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
  { onAmend }: ShowGraphEditsOptions = {},
): ShowGraphEdits {
  const queryClient = useQueryClient();
  // Read through a ref for the same reason `useGraphCommands` does: an inline
  // callback shouldn't rebuild the flush loop, and this only ever fires from
  // a settled request.
  const amend = useRef(onAmend);
  useEffect(() => {
    amend.current = onAmend;
  }, [onAmend]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const pending = useRef<(GraphEdit | CanvasWorkspaceEdit)[]>([]);
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
    const batch = pending.current.splice(0);
    const graphEdits = batch.filter((edit): edit is GraphEdit => !("canvasId" in edit));
    const canvasEdits = batch.filter((edit): edit is CanvasWorkspaceEdit => "canvasId" in edit);
    const edits = [...coalesceGraphEdits(graphEdits), ...coalesceCanvasWorkspaceEdits(canvasEdits)];
    const base = version.current;
    if (edits.length === 0 || !showId || base === null) {
      if (batch.length > 0) pending.current.unshift(...batch);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    graphqlRequest(GRAPHQL_ENDPOINT, ApplyShowEditsMutation, {
      showId,
      baseVersion: base,
      edits: edits.map(toEditInput),
    })
      .then((data) => {
        const result = data.applyShowEdits;
        version.current = result.version;
        queryClient.setQueryData(
          showGraphQueryKey(result.showId as ShowId, "draft"),
          (previous: ShowGraph | undefined) => {
            const graphEdits = edits.filter((edit): edit is GraphEdit => !("canvasId" in edit));
            const patched = patchShowGraphQueryData(previous, graphEdits);
            return patched
              ? { ...patched, updatedAt: result.updatedAt, version: result.version }
              : undefined;
          },
        );
        if (result.amendments.length > 0) {
          amend.current?.(result.amendments.map(toGraphEdit));
        }
      })
      .catch((reason: unknown) => {
        failed.current = true;
        setError(reason instanceof Error ? reason : new Error(String(reason)));
      })
      .finally(() => {
        inFlight.current = false;
        setSaving(false);
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
    (edits: readonly (GraphEdit | CanvasWorkspaceEdit)[]) => {
      if (edits.length === 0) return;
      if (showId) {
        const graphEdits = edits.filter((edit): edit is GraphEdit => !("canvasId" in edit));
        queryClient.setQueryData(
          showGraphQueryKey(showId, "draft"),
          (previous: ShowGraph | undefined) => patchShowGraphQueryData(previous, graphEdits),
        );
      }
      pending.current.push(...edits);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush, queryClient, showId],
  );

  return { enqueue, saving, error };
}

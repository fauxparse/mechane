// Keeping the navigate edges in step with the Actions they come from.
//
// Navigate edges are the materialized projection of the interaction Actions
// (`projectNavigateEdges`), so any command that touches a Cue, an Action or a
// Navigate Action's layout has to rebuild them — an edge written to directly
// lasts until the next write and no longer. Shared rather than private to the
// interaction commands, because dragging an edge is a graph command that
// changes an Action.

import type { Action, Cue, EventBinding, GraphEdge, ShowGraph } from "@mechane/domain";
import { projectNavigateEdges } from "@mechane/domain";

export type InteractionState = Pick<ShowGraph, "cues" | "actions" | "eventBindings">;

export type RequiredInteractionState = {
  cues: readonly Cue[];
  actions: readonly Action[];
  eventBindings: readonly EventBinding[];
};

/** The graph's interactions, with the absent collections read as empty. */
export function interactionsOf(graph: ShowGraph): RequiredInteractionState {
  return {
    cues: graph.cues ?? [],
    actions: graph.actions ?? [],
    eventBindings: graph.eventBindings ?? [],
  };
}

/** The graph with `next` in it, and its navigate edges projected afresh. */
export function withInteractions(graph: ShowGraph, next: InteractionState): ShowGraph {
  const projected = projectNavigateEdges({ ...graph, cues: next.cues, actions: next.actions });
  const edges: GraphEdge[] = [
    ...graph.edges.filter((edge) => edge.kind !== "navigate"),
    ...projected,
  ];
  return {
    ...graph,
    cues: next.cues ?? [],
    actions: next.actions ?? [],
    eventBindings: next.eventBindings ?? [],
    edges,
  };
}

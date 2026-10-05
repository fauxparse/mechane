// Keeping the navigate edges in step with the Actions they come from.
//
// Navigate edges are the materialized projection of the interaction Actions
// (`projectNavigateEdges`), so any command that touches a Cue, an Action or a
// Navigate Action's layout has to rebuild them — an edge written to directly
// lasts until the next write and no longer. Shared rather than private to the
// interaction commands, because dragging an edge is a graph command that
// changes an Action.

import type { GraphEdge, ShowGraph } from "@mechane/domain/graph";
import {
  type Action,
  type Cue,
  type EventBinding,
  type SlotEventBinding,
  projectNavigateEdges,
  projectUpdateEdges,
} from "@mechane/domain/interactions";

export type InteractionState = Pick<
  ShowGraph,
  "cues" | "actions" | "eventBindings" | "slotEventBindings"
>;

export type RequiredInteractionState = {
  cues: readonly Cue[];
  actions: readonly Action[];
  eventBindings: readonly EventBinding[];
  slotEventBindings: readonly SlotEventBinding[];
};

/** The graph's interactions, with the absent collections read as empty. */
export function interactionsOf(graph: ShowGraph): RequiredInteractionState {
  return {
    cues: graph.cues ?? [],
    actions: graph.actions ?? [],
    eventBindings: graph.eventBindings ?? [],
    slotEventBindings: graph.slotEventBindings ?? [],
  };
}

/**
 * The graph with `next` in it, and its navigate edges projected afresh.
 *
 * Slot Event Bindings have no projection of their own, so a caller that says
 * nothing about them keeps what the graph already holds — the same courtesy
 * the `...graph` spread extends to every collection this function does not
 * own.
 */
export function withInteractions(graph: ShowGraph, next: InteractionState): ShowGraph {
  const projected = [
    ...projectNavigateEdges({ ...graph, cues: next.cues, actions: next.actions }),
    ...projectUpdateEdges({ ...graph, cues: next.cues, actions: next.actions }),
  ];
  const edges: GraphEdge[] = [
    ...graph.edges.filter((edge) => edge.kind !== "navigate" && edge.kind !== "update"),
    ...projected,
  ];
  return {
    ...graph,
    cues: next.cues ?? [],
    actions: next.actions ?? [],
    eventBindings: next.eventBindings ?? [],
    slotEventBindings: next.slotEventBindings ?? graph.slotEventBindings ?? [],
    edges,
  };
}

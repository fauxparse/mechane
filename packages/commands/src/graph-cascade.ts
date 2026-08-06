// Deletion cascades, and what one delete destroys (issue #42, spec'd by #27
// and #36).
//
// ./graph-commands has the atoms; this is the policy layer that decides which
// atoms a single user-facing "delete" is made of. The two are separate
// because the atoms are what the graph *is* ("removing a node takes its edges
// with it") while the cascade is a product decision about blast radius:
//
//   - **Scene / Flow — recursive.** Deleting a Flow destroys the Flow, every
//     node nested inside it, their Variables, and every edge touching any of
//     them. Deleting a Scene destroys its Variables and every wiring or
//     Navigate edge attached (#27). There is no "empty it first" — deletion
//     destroys, unlike extraction, which preserves and therefore blocks
//     (#23, #44).
//   - **Source / Transformer / Device — non-recursive.** They contain
//     nothing, so only their own edges go. A downstream consumer loses one
//     input and is left with an undefined one, which is that node's own
//     editor's problem, not a reason to block (#29, #46).
//
// The whole cascade is **one** composite, so it's one undo entry however many
// nodes it destroyed (#28) — and a *bulk* delete of five nodes, two of them
// cascading Flows, is still one entry (#36's "undo arity" rule). That falls
// out of composing rather than needing its own mechanism.

import { composite } from "./command";
import { removeEdge, removeNode } from "./graph-commands";
import type { ShowGraphCommand } from "./graph-commands";
import type { GraphNode, ShowGraph } from "@mechane/domain";

/**
 * Everything a delete of `nodeIds` would destroy — the whole point being that
 * a director can be told the blast radius *before* it happens, since #27
 * confirms a non-empty Flow deletion and #36 makes that one dialog for the
 * whole bulk selection.
 */
export interface DeletionScope {
  /** Every node destroyed, cascade included, in graph order. */
  nodes: GraphNode[];
  /** Nodes the user asked for, as opposed to ones swept up by a cascade. */
  requestedIds: string[];
  /** Edges destroyed because an endpoint went with them, in graph order. */
  edgeIds: string[];
  /** Flows in the scope that contain at least one node. */
  nonEmptyFlows: GraphNode[];
  /**
   * Whether this deletion needs confirming (#27): only a non-empty Flow does,
   * and a bulk delete containing any of them confirms once for the lot (#36).
   */
  needsConfirmation: boolean;
}

/** Descendants of `nodeIds`, transitively. Flows are the only containers (#23). */
function containedNodeIds(graph: ShowGraph, nodeIds: Iterable<string>): Set<string> {
  const doomed = new Set(nodeIds);
  // A single pass would do while Flows can't nest, but walking until it
  // settles means this stays correct if containment ever deepens rather than
  // silently missing a level.
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of graph.nodes) {
      if (node.parentId !== null && doomed.has(node.parentId) && !doomed.has(node.id)) {
        doomed.add(node.id);
        grew = true;
      }
    }
  }
  return doomed;
}

/**
 * What deleting `nodeIds` (and optionally some edges outright) destroys.
 * Ids that aren't in the graph are ignored, so a stale selection describes
 * less rather than throwing.
 */
export function deletionScope(
  graph: ShowGraph,
  nodeIds: Iterable<string>,
  edgeIds: Iterable<string> = [],
): DeletionScope {
  const requested = [...nodeIds].filter((id) => graph.nodes.some((node) => node.id === id));
  const doomed = containedNodeIds(graph, requested);
  const nodes = graph.nodes.filter((node) => doomed.has(node.id));
  const explicitEdges = new Set(edgeIds);
  const edges = graph.edges.filter(
    (edge) => explicitEdges.has(edge.id) || doomed.has(edge.sourceId) || doomed.has(edge.targetId),
  );
  const nonEmptyFlows = nodes.filter(
    (node) => node.kind === "flow" && graph.nodes.some((other) => other.parentId === node.id),
  );
  return {
    nodes,
    requestedIds: requested,
    edgeIds: edges.map((edge) => edge.id),
    nonEmptyFlows,
    needsConfirmation: nonEmptyFlows.length > 0,
  };
}

/** What the confirmation dialog says a delete is about to destroy (#27, #36). */
export function describeDeletion(scope: DeletionScope): string {
  const counts = new Map<string, number>();
  for (const node of scope.nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
  const parts = [...counts].map(([kind, count]) => `${count} ${plural(kind, count)}`);
  // Edges are one more item in the same list, so the sentence reads
  // "1 flow, 2 scenes and 3 connections" rather than two "and"s in a row.
  if (scope.edgeIds.length > 0) {
    parts.push(`${scope.edgeIds.length} ${plural("connection", scope.edgeIds.length)}`);
  }
  if (parts.length === 0) return "Nothing to delete.";
  return list(parts);
}

// Every word this describes — scene, flow, source, transformer, device,
// connection — pluralises with an `s`, so there's nothing more to it.
function plural(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * The command that performs a deletion: one composite, one undo entry,
 * however wide the cascade (#28, #36).
 *
 * Order matters. Children are removed before their Flow and edges before
 * their endpoints, so every intermediate graph stays well-formed — and
 * because a composite inverts in reverse, one undo restores the Flow, then
 * its children, then the edges between them, which is the only order that
 * works.
 */
export function deleteGraphElements(
  graph: ShowGraph,
  nodeIds: Iterable<string>,
  edgeIds: Iterable<string> = [],
): ShowGraphCommand {
  const scope = deletionScope(graph, nodeIds, edgeIds);
  const commands: ShowGraphCommand[] = [
    ...scope.edgeIds.map((id) => removeEdge(id)),
    // Deepest first: a nested Scene is removed before the Flow that holds it.
    ...[...scope.nodes]
      .sort((a, b) => depth(graph, b) - depth(graph, a))
      .map((node) => removeNode(node.id)),
  ];
  return composite({ label: deletionLabel(scope), commands });
}

/** A deletion of only edges, for a selection that contains no nodes. */
export function deleteEdges(graph: ShowGraph, edgeIds: Iterable<string>): ShowGraphCommand {
  return deleteGraphElements(graph, [], edgeIds);
}

function depth(graph: ShowGraph, node: GraphNode): number {
  let depth = 0;
  let current: GraphNode | undefined = node;
  while (current?.parentId) {
    const parentId: string = current.parentId;
    current = graph.nodes.find((other) => other.id === parentId);
    depth += 1;
  }
  return depth;
}

/**
 * The undo entry's label. It names what the *user* asked to delete, not the
 * cascade — "Delete Flow" is what they did; the nine Scenes that went with it
 * are the consequence, and an undo entry reading "Delete 10 nodes" would be
 * describing the mechanism.
 */
function deletionLabel(scope: DeletionScope): string {
  if (scope.requestedIds.length === 0) {
    return scope.edgeIds.length === 1 ? "Delete connection" : "Delete connections";
  }
  if (scope.requestedIds.length === 1) {
    const node = scope.nodes.find((candidate) => candidate.id === scope.requestedIds[0]);
    return node ? `Delete ${node.kind}` : "Delete";
  }
  return `Delete ${scope.requestedIds.length} nodes`;
}

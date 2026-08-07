// The Show-graph edit vocabulary: what a command says to the server instead
// of the whole graph (issue #103).
//
// Every editor edit used to be flattened into a POST of the entire draft
// graph, which is last-write-wins by construction — fine while a Show has
// exactly one editor, impossible to build multiplayer on (PRD §1, v1.5) and
// useless to broadcast (ADR-0003 wants *what changed*). The command layer
// already modelled every edit granularly and invertibly; this is that model
// reaching the wire rather than stopping at the network boundary.
//
// A `GraphEdit` is a plain JSON value — no closures, no captured state — and
// there is exactly one for each primitive in ./graph-commands. That
// one-to-one pairing is deliberate: `commandForEdit` turns an edit back into
// the very command that produced it, so the server applies edits through the
// same code the client did, and "the server disagreed with the client about
// what a delete does" is not a class of bug that exists here.
//
// Two things the wire format deliberately does *not* carry:
//
//   - **Graph order.** `removeNode`'s inverse restores a node at the index it
//     sat at, because the editor's own ordering is visible to the user. The
//     server stores rows and reads them back ordered by id (apps/api's
//     `readShowGraph`), so an index would be a field nothing could honour.
//     Order stays a client concern, as it already was.
//   - **Intent beyond the atom.** A cascade arrives as the list of atoms it
//     was composed from, not as "delete Flow, recursively". The server
//     applies what it is told; blast radius is the editor's policy (#42).

import type { GraphEdge, GraphNode, Position, SceneVariable, ShowGraph } from "@mechane/domain";

import {
  addEdge,
  addNode,
  addSceneVariable,
  GRAPH_COMMAND_TYPES,
  moveNode,
  removeEdge,
  removeNode,
  removeSceneVariable,
  renameNode,
  renameSceneVariable,
  reparentNode,
  setFlowDefaultScene,
} from "./graph-commands";
import type { ShowGraphCommand } from "./graph-commands";

/**
 * One serialisable mutation of a Show graph — the unit the client sends and
 * the server applies. Tagged with the same `type` string as the command that
 * produces it, so a log of edits reads as a log of commands.
 */
export type GraphEdit =
  | { readonly type: typeof GRAPH_COMMAND_TYPES.addNode; readonly node: GraphNode }
  | { readonly type: typeof GRAPH_COMMAND_TYPES.removeNode; readonly nodeId: string }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.moveNode;
      readonly nodeId: string;
      readonly position: Position;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.renameNode;
      readonly nodeId: string;
      readonly name: string;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.reparentNode;
      readonly nodeId: string;
      readonly parentId: string | null;
      readonly position: Position;
    }
  | { readonly type: typeof GRAPH_COMMAND_TYPES.addEdge; readonly edge: GraphEdge }
  | { readonly type: typeof GRAPH_COMMAND_TYPES.removeEdge; readonly edgeId: string }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setFlowDefaultScene;
      readonly flowId: string;
      readonly sceneId: string | null;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.addSceneVariable;
      readonly sceneId: string;
      readonly variable: SceneVariable;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.renameSceneVariable;
      readonly sceneId: string;
      readonly variableId: string;
      readonly name: string;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.removeSceneVariable;
      readonly sceneId: string;
      readonly variableId: string;
    };

/** An edit naming something the graph doesn't contain, or a type nothing knows. */
export class UnknownGraphEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownGraphEditError";
  }
}

/**
 * The command that performs `edit`.
 *
 * The point of routing through commands rather than mutating the graph
 * directly is that the atoms already carry the rules that aren't in the edit:
 * removing a node takes its edges and any Flow's reference to it, removing a
 * Variable takes the wiring that fed it. An `applyGraphEdit` that reimplemented
 * those would be a second definition of the graph's semantics, free to drift
 * from the first.
 */
export function commandForEdit(edit: GraphEdit): ShowGraphCommand {
  switch (edit.type) {
    case GRAPH_COMMAND_TYPES.addNode:
      return addNode(edit.node);
    case GRAPH_COMMAND_TYPES.removeNode:
      return removeNode(edit.nodeId);
    case GRAPH_COMMAND_TYPES.moveNode:
      return moveNode(edit.nodeId, edit.position);
    case GRAPH_COMMAND_TYPES.renameNode:
      return renameNode(edit.nodeId, edit.name);
    case GRAPH_COMMAND_TYPES.reparentNode:
      return reparentNode(edit.nodeId, edit.parentId, edit.position);
    case GRAPH_COMMAND_TYPES.addEdge:
      return addEdge(edit.edge);
    case GRAPH_COMMAND_TYPES.removeEdge:
      return removeEdge(edit.edgeId);
    case GRAPH_COMMAND_TYPES.setFlowDefaultScene:
      return setFlowDefaultScene(edit.flowId, edit.sceneId);
    case GRAPH_COMMAND_TYPES.addSceneVariable:
      return addSceneVariable(edit.sceneId, edit.variable);
    case GRAPH_COMMAND_TYPES.renameSceneVariable:
      return renameSceneVariable(edit.sceneId, edit.variableId, edit.name);
    case GRAPH_COMMAND_TYPES.removeSceneVariable:
      return removeSceneVariable(edit.sceneId, edit.variableId);
    default: {
      // Exhaustive over the union above; reachable only from an edit that
      // came off the wire with a type this build has never heard of, which
      // is worth failing the whole batch over rather than skipping.
      const unknown: never = edit;
      throw new UnknownGraphEditError(
        `Unknown Show graph edit "${(unknown as { type: string }).type}".`,
      );
    }
  }
}

/**
 * `graph` with every edit applied, in order.
 *
 * All-or-nothing is the caller's business: this throws on the first edit that
 * can't apply (an unknown node, an illegal reparent) and the graph it was
 * given is untouched, so a caller in a transaction gets the behaviour it
 * wants by not catching.
 *
 * Deliberately no validation between edits — the same reasoning as
 * ./graph-commands: a batch legitimately passes through invalid intermediate
 * states, so `assertValidShowGraph` belongs at the end of the batch, at the
 * storage boundary, not inside the loop.
 */
export function applyGraphEdits(graph: ShowGraph, edits: readonly GraphEdit[]): ShowGraph {
  return edits.reduce((next, edit) => commandForEdit(edit).apply(next).state, graph);
}

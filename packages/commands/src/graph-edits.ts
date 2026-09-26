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
// what a delete does" is not a class of bug that exists here. The pairing
// itself lives in ./graph-edit-codec, next to the flattening it travels as
// (#347), so that an edit type has one entry to add rather than six.
//
// Two things the wire format deliberately does *not* carry:
//
//   - **Graph order.** `removeNode`'s inverse restores a node at the index it
//     sat at, because the editor's own ordering is visible to the user. The
//     server stores rows and reads them back ordered by id (apps/api's
//     `readShowGraph`), so an index would be a field nothing could honour.
//     Order stays a client concern, as it already was.
//   - **Every frame of a gesture.** The stack keeps all 150 positions a drag
//     emitted, because it has to invert them; the wire wants the last one.
//     `coalesceGraphEdits` is that reduction, and it belongs here rather than
//     in the stack because knowing that a move supersedes a move is knowing
//     what a move *is*.
//   - **Intent beyond the atom.** A cascade arrives as the list of atoms it
//     was composed from, not as "delete Flow, recursively". The server
//     applies what it is told; blast radius is the editor's policy (#42).

import type { ShowGraph } from "@mechane/domain/graph";
import { graphEditDescriptor } from "./graph-edit-codec";
import type { GraphEdit } from "./graph-edit-codec";
import type { ShowGraphCommand } from "./graph-commands";

export type { GraphEdit } from "./graph-edit-codec";

/**
 * One serialisable mutation of a Show graph — the unit the client sends and
 * the server applies. Tagged with the same `type` string as the command that
 * produces it, so a log of edits reads as a log of commands.
 */

/** An edit naming something the graph doesn't contain, or a type nothing knows. */
export class UnknownGraphEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownGraphEditError";
  }
}

/**
 * The descriptor owns both the edit's command and its wire-batch semantics.
 * Keeping this lookup here means graph edit application has no second
 * lifetime/coalescing registry to drift from the codec.
 */
function descriptorFor(edit: GraphEdit) {
  const descriptor = graphEditDescriptor(edit.type);
  if (!descriptor) {
    throw new UnknownGraphEditError(`Unknown Show graph edit "${edit.type}".`);
  }
  return descriptor;
}

export function commandForEdit(edit: GraphEdit): ShowGraphCommand {
  return descriptorFor(edit).command(edit);
}

/**
 * `edits` with the ones a later edit makes redundant dropped.
 *
 * A drag emits a position every frame and a rename a name every keystroke —
 * which is right for the undo stack, where the whole run is one entry the
 * user can step back through as a unit, and absurd on the wire, where 150
 * absolute positions for one node say exactly what the last one says.
 */
export function coalesceGraphEdits(edits: readonly GraphEdit[]): GraphEdit[] {
  const superseded = new Set<number>();
  const seen = new Map<string, readonly string[]>();
  for (let index = edits.length - 1; index >= 0; index -= 1) {
    const edit = edits[index] as GraphEdit;
    const barriers = descriptorFor(edit).structuralIds(edit);
    if (barriers.length > 0) {
      for (const [key, ids] of seen) {
        if (ids.some((id) => barriers.includes(id))) seen.delete(key);
      }
    }
    const setter = descriptorFor(edit).supersedes(edit);
    if (!setter) continue;
    if (seen.has(setter.key)) superseded.add(index);
    else seen.set(setter.key, setter.ids);
  }
  return superseded.size === 0 ? [...edits] : edits.filter((_, index) => !superseded.has(index));
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

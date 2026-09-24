// Studio's outbound end of the Show graph API boundary (issue #41).
//
// Reading a graph is not written here at all any more. The recursive Canvas
// decoder left first (#436, ADR-0014), the rest of the reconstruction
// followed (#742, ADR-0020) into `decodeShowGraphDocument`, shared with the
// Player, and the route now decodes once and hands the editor a domain graph
// (#750). This module used to hold eight converters the Player also held,
// and they had drifted.
//
// What is left is the direction this end owns. A write is not a whole graph
// (#103) but a list of edits, and the widening from a discriminated union to
// one flat wire shape is `@mechane/commands`' `encodeGraphEdit` and
// `encodeCanvasWorkspaceEdit` — the same descriptors the server decodes with
// (#347, #436), so a field cannot travel one way only. The one policy left
// here is that a pairing code is not the editor's to send.
import type {
  CanvasWorkspaceEdit,
  FlatCanvasEdit,
  FlatGraphEdit,
  GraphEdit,
} from "@mechane/commands";
import {
  decodeGraphEdit,
  encodeCanvasWorkspaceEdit,
  encodeGraphEdit,
  GRAPH_COMMAND_TYPES,
} from "@mechane/commands";
import type { ApplyShowEditsResult } from "@mechane/graphql-schema";

/**
 * One Studio edit as the mutation input wants it (#103, #164).
 *
 * Graph edits already carry their whole target. Canvas workspace edits carry
 * the Canvas id outside the tree edit because one Canvas edit vocabulary is
 * shared by every artboard.
 */
export type StudioEdit = GraphEdit | CanvasWorkspaceEdit;

/**
 * One Studio edit, flat, as the `ShowEditInput` mutation wants it.
 *
 * One input type carries both vocabularies, so this is the widening of both
 * codecs' shapes (#347, #436) rather than a union of them: `type` says which
 * fields mean anything, exactly as it does in the SDL.
 */
export type StudioEditInput = FlatGraphEdit & Partial<Omit<FlatCanvasEdit, "type">>;

export function toEditInput(edit: StudioEdit): StudioEditInput {
  if ("canvasId" in edit) return encodeCanvasWorkspaceEdit(edit);

  if (edit.type === GRAPH_COMMAND_TYPES.setDevicePairingCode) {
    throw new Error("A pairing code is the server's to mint, not the editor's to send.");
  }
  return encodeGraphEdit(edit);
}

/** An amendment as the mutation returns it (#111). */
export type ApiGraphEdit = ApplyShowEditsResult["amendments"][number];

/**
 * An amendment from the server, as an edit the command layer can apply.
 *
 * The inbound counterpart of `toEditInput`, through the same descriptor
 * (#347): what the server tells this editor about a change it didn't make is
 * the same vocabulary a realtime channel will use for a change someone else
 * made (ADR-0003), so widening the amendments this editor understands is a
 * matter of widening the mutation's selection set, not of writing another
 * table. An amendment naming a type this build has never heard of throws
 * rather than applying half of it.
 */
export function toGraphEdit(edit: ApiGraphEdit): GraphEdit {
  return decodeGraphEdit(edit);
}

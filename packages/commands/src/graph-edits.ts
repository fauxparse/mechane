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

import type {
  Block,
  BlockVariable,
  FlowColor,
  GraphEdge,
  GraphNode,
  Position,
  SceneVariable,
  Shape,
  ShapeField,
  ShowGraph,
  Type,
} from "@mechane/domain";
import { graphEditCodec } from "./graph-edit-codec";
import type { ShowGraphCommand } from "./graph-commands";
import { GRAPH_COMMAND_TYPES } from "./graph-commands";

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
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setSourceType;
      readonly nodeId: string;
      readonly sourceType: Type;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setWiringFieldMapping;
      readonly edgeId: string;
      readonly fieldMapping: Record<string, string> | null;
    }
  | { readonly type: typeof GRAPH_COMMAND_TYPES.removeEdge; readonly edgeId: string }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setFlowDefaultScene;
      readonly flowId: string;
      readonly sceneId: string | null;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setNodeColor;
      readonly nodeId: string;
      readonly color: FlowColor | null;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setShapes;
      readonly shapes: Shape[];
    }
  | { readonly type: typeof GRAPH_COMMAND_TYPES.addShape; readonly shape: Shape }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.renameShape;
      readonly shapeId: string;
      readonly name: string;
    }
  | { readonly type: typeof GRAPH_COMMAND_TYPES.duplicateShape; readonly shape: Shape }
  | { readonly type: typeof GRAPH_COMMAND_TYPES.removeShape; readonly shapeId: string }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.addShapeField;
      readonly shapeId: string;
      readonly field: ShapeField;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.renameShapeField;
      readonly shapeId: string;
      readonly fieldId: string;
      readonly name: string;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setShapeFieldType;
      readonly shapeId: string;
      readonly fieldId: string;
      readonly fieldType: Type;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setShapeFieldDefault;
      readonly shapeId: string;
      readonly fieldId: string;
      readonly defaultValue: unknown;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.reorderShapeFields;
      readonly shapeId: string;
      readonly fieldIds: readonly string[];
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.removeShapeField;
      readonly shapeId: string;
      readonly fieldId: string;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setShapeFieldRequired;
      readonly shapeId: string;
      readonly fieldId: string;
      readonly required: boolean;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setSourceFieldDefault;
      readonly nodeId: string;
      readonly fieldPath: readonly string[];
      readonly value: unknown;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.addSceneVariable;
      readonly sceneId: string;
      readonly variable: SceneVariable;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.reorderSceneVariables;
      readonly sceneId: string;
      readonly variableIds: readonly string[];
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.renameSceneVariable;
      readonly sceneId: string;
      readonly variableId: string;
      readonly name: string;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setSceneVariableType;
      readonly sceneId: string;
      readonly variableId: string;
      readonly variableType: Type | null;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setSceneVariableDefault;
      readonly sceneId: string;
      readonly variableId: string;
      readonly defaultValue: unknown;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.removeSceneVariable;
      readonly sceneId: string;
      readonly variableId: string;
    }
  /**
   * The one edit that only ever travels *from* the server (#111): the pairing
   * code it minted for a Device the client had just created (#45). A client
   * that sent one would be guessing at something only the server can decide,
   * which is why apps/api refuses it on the way in rather than merely
   * ignoring it.
   */
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setDevicePairingCode;
      readonly nodeId: string;
      readonly pairingCode: string | null;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setDevicePerConnection;
      readonly nodeId: string;
      readonly perConnection: boolean;
    }
  | { readonly type: typeof GRAPH_COMMAND_TYPES.addBlock; readonly block: Block }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setBlockVariables;
      readonly blockId: string;
      readonly variables: readonly BlockVariable[];
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.renameBlock;
      readonly blockId: string;
      readonly name: string;
    }
  | { readonly type: typeof GRAPH_COMMAND_TYPES.duplicateBlock; readonly block: Block }
  | { readonly type: typeof GRAPH_COMMAND_TYPES.removeBlock; readonly blockId: string };

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
  const codec = graphEditCodec(edit.type);
  if (!codec) {
    // Not reachable from the union above; reachable from an edit that came
    // off the wire with a type this build has never heard of, which is worth
    // failing the whole batch over rather than skipping.
    throw new UnknownGraphEditError(`Unknown Show graph edit "${edit.type}".`);
  }
  return codec.command(edit);
}

/**
 * An edit that *sets* a value rather than nudging one, and therefore makes
 * any earlier edit setting the same thing redundant: the key it writes, and
 * the ids whose creation or destruction in between would mean the two edits
 * aren't talking about the same thing after all.
 *
 * Deliberately not every edit type. `addEdge`/`removeEdge` and the add/remove
 * pairs are *steps* — two of them in a batch mean two different things
 * happened, and collapsing them would lose one.
 */
function supersedes(edit: GraphEdit): { key: string; ids: readonly string[] } | null {
  switch (edit.type) {
    case GRAPH_COMMAND_TYPES.moveNode:
      return { key: `move:${edit.nodeId}`, ids: [edit.nodeId] };
    case GRAPH_COMMAND_TYPES.renameNode:
      return { key: `rename:${edit.nodeId}`, ids: [edit.nodeId] };
    case GRAPH_COMMAND_TYPES.reparentNode:
      // Absolute like a move: it carries both the Flow and the position, so
      // the last one is the whole answer.
      return {
        key: `reparent:${edit.nodeId}`,
        ids: edit.parentId === null ? [edit.nodeId] : [edit.nodeId, edit.parentId],
      };
    case GRAPH_COMMAND_TYPES.setSourceType:
      return { key: `sourceType:${edit.nodeId}`, ids: [edit.nodeId] };
    case GRAPH_COMMAND_TYPES.setWiringFieldMapping:
      return { key: `wiringFieldMapping:${edit.edgeId}`, ids: [edit.edgeId] };
    case GRAPH_COMMAND_TYPES.setSourceFieldDefault:
      return {
        key: `sourceFieldDefault:${edit.nodeId}:${edit.fieldPath.join(".")}`,
        ids: [edit.nodeId, ...edit.fieldPath],
      };
    case GRAPH_COMMAND_TYPES.setShapes:
      return { key: GRAPH_COMMAND_TYPES.setShapes, ids: edit.shapes.map((shape) => shape.id) };
    case GRAPH_COMMAND_TYPES.renameShape:
      return { key: `renameShape:${edit.shapeId}`, ids: [edit.shapeId] };
    case GRAPH_COMMAND_TYPES.renameShapeField:
      return {
        key: `renameShapeField:${edit.shapeId}:${edit.fieldId}`,
        ids: [edit.shapeId, edit.fieldId],
      };
    case GRAPH_COMMAND_TYPES.setShapeFieldType:
      return {
        key: `shapeFieldType:${edit.shapeId}:${edit.fieldId}`,
        ids: [edit.shapeId, edit.fieldId],
      };
    case GRAPH_COMMAND_TYPES.setShapeFieldDefault:
      return {
        key: `shapeFieldDefault:${edit.shapeId}:${edit.fieldId}`,
        ids: [edit.shapeId, edit.fieldId],
      };
    case GRAPH_COMMAND_TYPES.setShapeFieldRequired:
      return {
        key: `shapeFieldRequired:${edit.shapeId}:${edit.fieldId}`,
        ids: [edit.shapeId, edit.fieldId],
      };
    case GRAPH_COMMAND_TYPES.reorderShapeFields:
      return {
        key: `shapeFieldOrder:${edit.shapeId}`,
        ids: [edit.shapeId, ...edit.fieldIds],
      };
    case GRAPH_COMMAND_TYPES.setFlowDefaultScene:
      return {
        key: `defaultScene:${edit.flowId}`,
        ids: edit.sceneId === null ? [edit.flowId] : [edit.flowId, edit.sceneId],
      };
    case GRAPH_COMMAND_TYPES.setNodeColor:
      return { key: `nodeColor:${edit.nodeId}`, ids: [edit.nodeId] };
    case GRAPH_COMMAND_TYPES.setSceneVariableType:
      return {
        key: `variableType:${edit.sceneId}:${edit.variableId}`,
        ids: [edit.sceneId, edit.variableId],
      };
    case GRAPH_COMMAND_TYPES.reorderSceneVariables:
      return {
        key: `variableOrder:${edit.sceneId}`,
        ids: [edit.sceneId, ...edit.variableIds],
      };
    case GRAPH_COMMAND_TYPES.setDevicePerConnection:
      return { key: `perConnection:${edit.nodeId}`, ids: [edit.nodeId] };
    default:
      return null;
  }
}

/** Ids this edit brings into existence or destroys — a barrier for the above. */
function structuralIds(edit: GraphEdit): readonly string[] {
  switch (edit.type) {
    case GRAPH_COMMAND_TYPES.addNode:
      return [edit.node.id];
    case GRAPH_COMMAND_TYPES.removeNode:
      return [edit.nodeId];
    case GRAPH_COMMAND_TYPES.addShape:
    case GRAPH_COMMAND_TYPES.duplicateShape:
      return [edit.shape.id];
    case GRAPH_COMMAND_TYPES.removeShape:
      return [edit.shapeId];
    case GRAPH_COMMAND_TYPES.addShapeField:
      return [edit.shapeId, edit.field.id];
    case GRAPH_COMMAND_TYPES.removeShapeField:
      return [edit.shapeId, edit.fieldId];
    case GRAPH_COMMAND_TYPES.addSceneVariable:
      return [edit.variable.id];
    case GRAPH_COMMAND_TYPES.removeSceneVariable:
      return [edit.variableId];
    default:
      return [];
  }
}

/**
 * `edits` with the ones a later edit makes redundant dropped.
 *
 * A drag emits a position every frame and a rename a name every keystroke —
 * which is right for the undo stack, where the whole run is one entry the
 * user can step back through as a unit, and absurd on the wire, where 150
 * absolute positions for one node say exactly what the last one says. This is
 * the difference between the two: the stack keeps every frame because it
 * needs to invert them, the network sends the outcome.
 *
 * Only *absolute setters* collapse (see `supersedes`), and only across a span
 * with no add or remove of the ids involved: "move n, delete n, restore n,
 * move n" is two moves of two different lifetimes of that node, and the first
 * one stays. Everything else keeps its order and its multiplicity, so the
 * batch still replays to exactly the graph the client is looking at.
 */
export function coalesceGraphEdits(edits: readonly GraphEdit[]): GraphEdit[] {
  // Backwards, because the *last* setter is the one that survives: an edit is
  // dropped when a key it wrote has already been seen further along.
  const superseded = new Set<number>();
  const seen = new Map<string, readonly string[]>();
  for (let index = edits.length - 1; index >= 0; index -= 1) {
    const edit = edits[index] as GraphEdit;
    // A node coming or going resets everything it takes part in: edits either
    // side of it are about different lifetimes, not the same value twice.
    const barriers = structuralIds(edit);
    if (barriers.length > 0) {
      for (const [key, ids] of seen) {
        if (ids.some((id) => barriers.includes(id))) seen.delete(key);
      }
    }
    const setter = supersedes(edit);
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

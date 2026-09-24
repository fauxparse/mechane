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
  Action,
  Cue,
  EdgeLayout,
  EventBinding,
  FlowSize,
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
  TransformerInputPort,
  TransformerTransform,
} from "@mechane/domain";
import { graphEditDescriptor } from "./graph-edit-codec";
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
      readonly type: typeof GRAPH_COMMAND_TYPES.setFlowSize;
      readonly flowId: string;
      readonly size: FlowSize | null;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setSourceColumnSizes;
      readonly nodeId: string;
      readonly columnSizes: Record<string, number> | null;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setNodeColor;
      readonly nodeId: string;
      readonly color: FlowColor | null;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setEdgeLayout;
      readonly edgeId: string;
      readonly layout: EdgeLayout | null;
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
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setTransformerFormula;
      readonly nodeId: string;
      readonly formula: string | null;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setTransformerOutputType;
      readonly nodeId: string;
      readonly outputType: Type | null;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.replaceTransformer;
      readonly nodeId: string;
      readonly ports: readonly TransformerInputPort[];
      readonly transform: TransformerTransform;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.addTransformerPort;
      readonly nodeId: string;
      readonly port: TransformerInputPort;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.renameTransformerPort;
      readonly nodeId: string;
      readonly portId: string;
      readonly name: string;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.reorderTransformerPorts;
      readonly nodeId: string;
      readonly portIds: readonly string[];
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.removeTransformerPort;
      readonly nodeId: string;
      readonly portId: string;
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
  | { readonly type: typeof GRAPH_COMMAND_TYPES.removeBlock; readonly blockId: string }
  | { readonly type: typeof GRAPH_COMMAND_TYPES.addCue; readonly cue: Cue }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.renameCue;
      readonly cueId: string;
      readonly name: string;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setCueActionOrder;
      readonly cueId: string;
      readonly actionIds: readonly string[];
    }
  | { readonly type: typeof GRAPH_COMMAND_TYPES.removeCue; readonly cueId: string }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.addNavigateAction;
      readonly action: Extract<Action, { kind: "navigate" }>;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.addUpdateAction;
      readonly action: Extract<Action, { kind: "update" }>;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setUpdateTarget;
      readonly actionId: string;
      readonly target: Extract<Action, { kind: "update" }>["target"];
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setUpdateOperation;
      readonly actionId: string;
      readonly operation: Extract<Action, { kind: "update" }>["operation"];
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setUpdateOperand;
      readonly actionId: string;
      readonly operand: Extract<
        Extract<Action, { kind: "update" }>["operation"],
        { kind: "set" | "adjust" }
      >["operand"];
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setNavigateTarget;
      readonly actionId: string;
      readonly targetSceneId: string;
    }
  | { readonly type: typeof GRAPH_COMMAND_TYPES.removeAction; readonly actionId: string }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.addEventBinding;
      readonly binding: EventBinding;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setEventBindingCue;
      readonly bindingId: string;
      readonly cueId: string;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setEventBindingKey;
      readonly bindingId: string;
      readonly key: string | null;
    }
  | {
      readonly type: typeof GRAPH_COMMAND_TYPES.setEventBindingOrder;
      readonly bindingIds: readonly string[];
    }
  | { readonly type: typeof GRAPH_COMMAND_TYPES.removeEventBinding; readonly bindingId: string };

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


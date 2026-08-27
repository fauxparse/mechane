// The one place a `GraphEdit` becomes a flat wire record and back (#347).
//
// GraphQL has no input unions, so an edit crosses the wire as one flat
// record whose `type` says which of its fields mean anything (ADR-0007,
// ADR-0008). That flattening used to be written out by hand at three
// separate surfaces — studio's outbound mapper, the api's inbound parser,
// and the api's outbound serialiser for amendments — with a fourth table
// (`commandForEdit`) pairing each edit with the command that performs it.
// Nothing checked that the four agreed, and they didn't: a `graph.addNode`
// restoring a deleted Scene lost its Variables' `rank` on the way in and
// their `suggestedDimensions` on the way out, which made Cmd+Z after
// deleting a Scene quietly reorder its Variables (ADR-0005 sends an undo as
// an ordinary forward `graph.addNode`).
//
// So there is one descriptor per edit type here, holding all four facts
// together — `command`, `encode`, `decode` — in a record whose type is
// mapped over `GraphEdit["type"]`. Adding an edit variant without a
// descriptor doesn't compile, and `decode(encode(edit))` is a test rather
// than a hope (./graph-edit-codec.test.ts).
//
// Two things this module deliberately does not decide:
//
//   - **Who may send what.** `graph.setDevicePairingCode` travels only
//     server → client (#111), and both adapters refuse it in their own
//     direction. Encoding and decoding it is still honest mechanics, and the
//     round-trip test needs it; direction is policy, and policy lives at the
//     adapters.
//   - **How a rejection is reported.** Envelope violations ("a rename with
//     no name") throw `GraphEditCodecError`. The api adapter turns that into
//     a `BAD_USER_INPUT` GraphQLError; nothing here imports GraphQL.

import type {
  Block,
  FlowColor,
  GraphEdge,
  GraphNode,
  Position,
  SceneVariable,
  Shape,
  ShapeField,
  SuggestedImageDimensions,
  Type,
} from "@mechane/domain";
import { assertValidFlowColor, isEdgeKind, isNodeKind } from "@mechane/domain";
import type { ShowGraphCommand } from "./graph-commands";
import {
  addBlock,
  addEdge,
  addNode,
  addSceneVariable,
  addShape,
  addShapeField,
  duplicateBlock,
  duplicateShape,
  GRAPH_COMMAND_TYPES,
  moveNode,
  removeBlock,
  removeEdge,
  removeNode,
  removeSceneVariable,
  removeShape,
  removeShapeField,
  renameBlock,
  renameNode,
  renameSceneVariable,
  renameShape,
  renameShapeField,
  reorderSceneVariables,
  reorderShapeFields,
  reparentNode,
  setDevicePairingCode,
  setDevicePerConnection,
  setFlowDefaultScene,
  setNodeColor,
  setSceneVariableType,
  setShapeFieldDefault,
  setShapeFieldRequired,
  setShapeFieldType,
  setShapes,
  setSourceFieldDefault,
  setSourceType,
  setWiringFieldMapping,
} from "./graph-commands";
import type { GraphEdit } from "./graph-edits";

/** An edit that named a field its `type` needs, or named nothing at all. */
export class GraphEditCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphEditCodecError";
  }
}

// ---------------------------------------------------------------------------
// Flat shapes
//
// One declaration per wire shape, mirroring the SDL input types. Every field
// an edit might carry is optional here for the same reason it is optional in
// the SDL: `type` decides which ones are read.
// ---------------------------------------------------------------------------

export interface FlatType {
  kind: string;
  of?: FlatType | null;
  shapeId?: string | null;
}

export interface FlatSceneVariable {
  id: string;
  name: string;
  rank?: string | null;
  type?: FlatType | null;
  suggestedDimensions?: SuggestedImageDimensions | null;
}

export interface FlatGraphNode {
  id: string;
  kind: string;
  name: string;
  parentId?: string | null;
  defaultSceneId?: string | null;
  color?: string | null;
  type?: FlatType | null;
  position: Position;
  variables?: FlatSceneVariable[] | null;
  perConnection?: boolean | null;
}

export interface FlatGraphEdge {
  id: string;
  kind: string;
  sourceId: string;
  targetId: string;
  sourcePath?: string[] | null;
  targetPath?: string[] | null;
  fieldMapping?: Record<string, string> | null;
  cueId?: string | null;
  actionId?: string | null;
}

export interface FlatShapeField {
  id: string;
  name: string;
  type: FlatType;
  /** The Field's place in its Shape's ordered list, which JSON can't carry. */
  position: number;
  required: boolean;
  defaultValue?: unknown;
}

export interface FlatShape {
  id: string;
  name: string;
  fields: FlatShapeField[];
}

/** One edit as a flat record: the shape both adapters exchange. */
export interface FlatGraphEdit {
  type: string;
  nodeId?: string | null;
  blockId?: string | null;
  node?: FlatGraphNode | null;
  edgeId?: string | null;
  edge?: FlatGraphEdge | null;
  position?: Position | null;
  shapeId?: string | null;
  shape?: FlatShape | null;
  fieldId?: string | null;
  field?: FlatShapeField | null;
  fieldIds?: string[] | null;
  fieldType?: FlatType | null;
  defaultValue?: unknown;
  required?: boolean | null;
  parentId?: string | null;
  name?: string | null;
  flowId?: string | null;
  sceneId?: string | null;
  variableId?: string | null;
  variableIds?: string[] | null;
  variable?: FlatSceneVariable | null;
  variableType?: FlatType | null;
  sourceType?: FlatType | null;
  color?: string | null;
  shapes?: FlatShape[] | null;
  fieldPath?: string[] | null;
  fieldMapping?: Record<string, string> | null;
  value?: unknown;
  perConnection?: boolean | null;
  block?: Block | null;
  /** Server → client only (#111); see the header note on direction. */
  pairingCode?: string | null;
}

// ---------------------------------------------------------------------------
// Envelope reads
// ---------------------------------------------------------------------------

function required<T>(flat: FlatGraphEdit, field: string, value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new GraphEditCodecError(`A "${flat.type}" edit needs a ${field}.`);
  }
  return value;
}

/** A field that is meaningfully nullable: absent and null both read as null. */
function nullable<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

function requiredPosition(flat: FlatGraphEdit): Position {
  const value = required(flat, "position", flat.position);
  return { x: value.x, y: value.y };
}

function decodeColor(value: string | null | undefined): FlowColor | null {
  if (value === null || value === undefined) return null;
  try {
    return assertValidFlowColor(value);
  } catch (error) {
    throw new GraphEditCodecError(
      error instanceof Error ? error.message : `Invalid Flow color "${value}".`,
    );
  }
}

// ---------------------------------------------------------------------------
// Types, Shapes, Variables
// ---------------------------------------------------------------------------

const SIMPLE_TYPES = ["text", "number", "boolean", "image", "color", "date", "datetime"] as const;

export function encodeType(type: Type | null | undefined): FlatType | null {
  if (!type) return null;
  if (typeof type === "string") return { kind: type };
  if (type.kind === "array") return { kind: "array", of: encodeType(type.of) };
  return { kind: "shape", shapeId: type.shapeId };
}

export function decodeType(flat: FlatType | null | undefined): Type | null {
  if (!flat) return null;
  if ((SIMPLE_TYPES as readonly string[]).includes(flat.kind)) return flat.kind as Type;
  if (flat.kind === "array" && flat.of) return { kind: "array", of: decodeType(flat.of)! };
  if (flat.kind === "shape" && flat.shapeId) return { kind: "shape", shapeId: flat.shapeId };
  throw new GraphEditCodecError(`Invalid Shape type "${flat.kind}".`);
}

export function encodeShape(shape: Shape): FlatShape {
  return {
    id: shape.id,
    name: shape.name,
    // Field order is the Shape's own (CONTEXT.md: "an ordered list of
    // Fields"), and a JSON array of a GraphQL list input is not guaranteed
    // to survive as one, so the order travels as data.
    fields: shape.fields.map((field, position) => ({
      id: field.id,
      name: field.name,
      type: encodeType(field.type)!,
      position,
      required: field.required,
      defaultValue: field.defaultValue ?? null,
    })),
  };
}
function encodeShapeField(field: ShapeField): FlatShapeField {
  return {
    id: field.id,
    name: field.name,
    type: encodeType(field.type)!,
    position: 0,
    required: field.required,
    defaultValue: field.defaultValue ?? null,
  };
}

function decodeShapeField(flat: FlatShapeField): ShapeField {
  return {
    id: flat.id,
    name: flat.name,
    type: decodeType(flat.type)!,
    required: flat.required,
    defaultValue: flat.defaultValue ?? null,
  };
}

export function decodeShape(flat: FlatShape): Shape {
  return {
    id: flat.id,
    name: flat.name,
    fields: flat.fields
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((field): ShapeField => ({
        id: field.id,
        name: field.name,
        type: decodeType(field.type)!,
        required: field.required,
        defaultValue: field.defaultValue ?? null,
      })),
  };
}

export function encodeSceneVariable(variable: SceneVariable): FlatSceneVariable {
  return {
    id: variable.id,
    name: variable.name,
    ...(variable.rank ? { rank: variable.rank } : {}),
    type: encodeType(variable.type),
    ...(variable.suggestedDimensions ? { suggestedDimensions: variable.suggestedDimensions } : {}),
  };
}

export function decodeSceneVariable(flat: FlatSceneVariable): SceneVariable {
  const type = decodeType(flat.type);
  return {
    id: flat.id,
    name: flat.name,
    ...(flat.rank ? { rank: flat.rank } : {}),
    ...(type ? { type } : {}),
    ...(flat.suggestedDimensions ? { suggestedDimensions: flat.suggestedDimensions } : {}),
  };
}

// ---------------------------------------------------------------------------
// Nodes and edges
//
// Both directions go through these, which is the whole point: a field either
// travels or it doesn't, and it can't travel one way only.
// ---------------------------------------------------------------------------

export function encodeNode(node: GraphNode): FlatGraphNode {
  return {
    id: node.id,
    kind: node.kind,
    name: node.name,
    parentId: node.parentId,
    defaultSceneId: node.kind === "flow" ? node.defaultSceneId : null,
    color: node.color ?? null,
    type: node.kind === "source" || node.kind === "transformer" ? encodeType(node.type) : null,
    position: { x: node.position.x, y: node.position.y },
    variables: node.kind === "scene" ? node.variables.map(encodeSceneVariable) : [],
    perConnection: node.kind === "device" ? node.perConnection : false,
  };
}

export function decodeNode(flat: FlatGraphNode): GraphNode {
  if (!isNodeKind(flat.kind)) {
    throw new GraphEditCodecError(`Unknown graph node kind "${flat.kind}" on node "${flat.id}".`);
  }
  const color = decodeColor(flat.color);
  const type = decodeType(flat.type);
  const base = {
    id: flat.id,
    name: flat.name,
    position: { x: flat.position.x, y: flat.position.y },
    ...(color ? { color } : {}),
  };
  const parentId = flat.parentId ?? null;
  switch (flat.kind) {
    case "scene":
      return {
        ...base,
        kind: "scene",
        parentId,
        variables: (flat.variables ?? []).map(decodeSceneVariable),
      };
    case "flow":
      if (parentId !== null) {
        throw new GraphEditCodecError(
          `Flow "${flat.id}" was given a parentId; Flows are never nested.`,
        );
      }
      return { ...base, kind: "flow", parentId: null, defaultSceneId: flat.defaultSceneId ?? null };
    case "source":
      if (!type) throw new GraphEditCodecError(`Source "${flat.id}" must have a Type.`);
      return { ...base, kind: "source", parentId, type };
    case "transformer":
      return { ...base, kind: "transformer", parentId, type };
    case "device":
      if (parentId !== null) {
        throw new GraphEditCodecError(
          `Device "${flat.id}" was given a parentId; Devices are Show-level.`,
        );
      }
      return {
        ...base,
        kind: "device",
        parentId: null,
        perConnection: flat.perConnection ?? false,
        // Never off the wire: a code is the server's to mint (#45).
        pairingCode: null,
      };
  }
}

export function encodeEdge(edge: GraphEdge): FlatGraphEdge {
  return {
    id: edge.id,
    kind: edge.kind,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    sourcePath: [...edge.sourcePath],
    targetPath: [...edge.targetPath],
    ...(edge.kind === "wiring" ? { fieldMapping: edge.fieldMapping ?? null } : {}),
    cueId: edge.kind === "navigate" ? edge.cueId : null,
    actionId: edge.kind === "navigate" ? edge.actionId : null,
  };
}

export function decodeEdge(flat: FlatGraphEdge): GraphEdge {
  if (!isEdgeKind(flat.kind)) {
    throw new GraphEditCodecError(`Unknown edge kind "${flat.kind}" on edge "${flat.id}".`);
  }
  const base = {
    id: flat.id,
    sourceId: flat.sourceId,
    targetId: flat.targetId,
    sourcePath: flat.sourcePath ?? [],
    targetPath: flat.targetPath ?? [],
  };
  switch (flat.kind) {
    case "wiring":
      return { ...base, kind: "wiring", fieldMapping: flat.fieldMapping ?? undefined };
    case "navigate":
      return {
        ...base,
        kind: "navigate",
        cueId: flat.cueId ?? null,
        actionId: flat.actionId ?? null,
      };
    case "device":
      return { ...base, kind: "device" };
  }
}

// ---------------------------------------------------------------------------
// The descriptor record
// ---------------------------------------------------------------------------

type EditOf<T extends GraphEdit["type"]> = Extract<GraphEdit, { type: T }>;

/**
 * Everything the wire needs to know about one edit type, in one place: the
 * command that performs it, and the two halves of its flattening.
 */
export interface GraphEditCodec<T extends GraphEdit["type"]> {
  readonly command: (edit: EditOf<T>) => ShowGraphCommand;
  readonly encode: (edit: EditOf<T>) => FlatGraphEdit;
  readonly decode: (flat: FlatGraphEdit) => EditOf<T>;
}

/**
 * One descriptor per edit type. The mapped type is the exhaustiveness check:
 * a `GraphEdit` variant with no entry here is a compile error, which is what
 * six hand-maintained tables could never give.
 */
export const GRAPH_EDIT_CODECS: { [T in GraphEdit["type"]]: GraphEditCodec<T> } = {
  [GRAPH_COMMAND_TYPES.addNode]: {
    command: (edit) => addNode(edit.node),
    encode: (edit) => ({ type: edit.type, node: encodeNode(edit.node) }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.addNode,
      node: decodeNode(required(flat, "node", flat.node)),
    }),
  },
  [GRAPH_COMMAND_TYPES.removeNode]: {
    command: (edit) => removeNode(edit.nodeId),
    encode: (edit) => ({ type: edit.type, nodeId: edit.nodeId }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.removeNode,
      nodeId: required(flat, "nodeId", flat.nodeId),
    }),
  },
  [GRAPH_COMMAND_TYPES.moveNode]: {
    command: (edit) => moveNode(edit.nodeId, edit.position),
    encode: (edit) => ({ type: edit.type, nodeId: edit.nodeId, position: edit.position }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.moveNode,
      nodeId: required(flat, "nodeId", flat.nodeId),
      position: requiredPosition(flat),
    }),
  },
  [GRAPH_COMMAND_TYPES.renameNode]: {
    command: (edit) => renameNode(edit.nodeId, edit.name),
    encode: (edit) => ({ type: edit.type, nodeId: edit.nodeId, name: edit.name }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.renameNode,
      nodeId: required(flat, "nodeId", flat.nodeId),
      name: required(flat, "name", flat.name),
    }),
  },
  [GRAPH_COMMAND_TYPES.reparentNode]: {
    command: (edit) => reparentNode(edit.nodeId, edit.parentId, edit.position),
    encode: (edit) => ({
      type: edit.type,
      nodeId: edit.nodeId,
      parentId: edit.parentId,
      position: edit.position,
    }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.reparentNode,
      nodeId: required(flat, "nodeId", flat.nodeId),
      // Null is the whole point here: it means "out to Show level".
      parentId: nullable(flat.parentId),
      position: requiredPosition(flat),
    }),
  },
  [GRAPH_COMMAND_TYPES.addEdge]: {
    command: (edit) => addEdge(edit.edge),
    encode: (edit) => ({ type: edit.type, edge: encodeEdge(edit.edge) }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.addEdge,
      edge: decodeEdge(required(flat, "edge", flat.edge)),
    }),
  },
  [GRAPH_COMMAND_TYPES.removeEdge]: {
    command: (edit) => removeEdge(edit.edgeId),
    encode: (edit) => ({ type: edit.type, edgeId: edit.edgeId }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.removeEdge,
      edgeId: required(flat, "edgeId", flat.edgeId),
    }),
  },
  [GRAPH_COMMAND_TYPES.setSourceType]: {
    command: (edit) => setSourceType(edit.nodeId, edit.sourceType),
    encode: (edit) => ({
      type: edit.type,
      nodeId: edit.nodeId,
      sourceType: encodeType(edit.sourceType),
    }),
    decode: (flat) => {
      if (flat.sourceType === undefined) {
        throw new GraphEditCodecError(`A "${flat.type}" edit needs a sourceType.`);
      }
      return {
        type: GRAPH_COMMAND_TYPES.setSourceType,
        nodeId: required(flat, "nodeId", flat.nodeId),
        sourceType: decodeType(flat.sourceType)!,
      };
    },
  },
  [GRAPH_COMMAND_TYPES.setWiringFieldMapping]: {
    command: (edit) => setWiringFieldMapping(edit.edgeId, edit.fieldMapping),
    encode: (edit) => ({
      type: edit.type,
      edgeId: edit.edgeId,
      fieldMapping: edit.fieldMapping,
    }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.setWiringFieldMapping,
      edgeId: required(flat, "edgeId", flat.edgeId),
      fieldMapping: flat.fieldMapping ?? null,
    }),
  },
  [GRAPH_COMMAND_TYPES.setFlowDefaultScene]: {
    command: (edit) => setFlowDefaultScene(edit.flowId, edit.sceneId),
    encode: (edit) => ({ type: edit.type, flowId: edit.flowId, sceneId: edit.sceneId }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.setFlowDefaultScene,
      flowId: required(flat, "flowId", flat.flowId),
      // Also meaningfully null: a Flow can be left without an entry Scene.
      sceneId: nullable(flat.sceneId),
    }),
  },
  [GRAPH_COMMAND_TYPES.setNodeColor]: {
    command: (edit) => setNodeColor(edit.nodeId, edit.color),
    encode: (edit) => ({ type: edit.type, nodeId: edit.nodeId, color: edit.color }),
    decode: (flat) => {
      // Absent and null differ here, as they do for a Variable's Type: null
      // returns the node to its Flow's colorway, and saying nothing at all is
      // an edit that forgot what it was for.
      if (flat.color === undefined) {
        throw new GraphEditCodecError(`A "${flat.type}" edit needs a color.`);
      }
      return {
        type: GRAPH_COMMAND_TYPES.setNodeColor,
        nodeId: required(flat, "nodeId", flat.nodeId),
        color: decodeColor(flat.color),
      };
    },
  },
  [GRAPH_COMMAND_TYPES.setShapes]: {
    command: (edit) => setShapes(edit.shapes),
    encode: (edit) => ({ type: edit.type, shapes: edit.shapes.map(encodeShape) }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.setShapes,
      shapes: (flat.shapes ?? []).map(decodeShape),
    }),
  },
  [GRAPH_COMMAND_TYPES.addShape]: {
    command: (edit) => addShape(edit.shape),
    encode: (edit) => ({ type: edit.type, shape: encodeShape(edit.shape) }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.addShape,
      shape: decodeShape(required(flat, "shape", flat.shape)),
    }),
  },
  [GRAPH_COMMAND_TYPES.renameShape]: {
    command: (edit) => renameShape(edit.shapeId, edit.name),
    encode: (edit) => ({ type: edit.type, shapeId: edit.shapeId, name: edit.name }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.renameShape,
      shapeId: required(flat, "shapeId", flat.shapeId),
      name: required(flat, "name", flat.name),
    }),
  },
  [GRAPH_COMMAND_TYPES.duplicateShape]: {
    command: (edit) => duplicateShape(edit.shape),
    encode: (edit) => ({ type: edit.type, shape: encodeShape(edit.shape) }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.duplicateShape,
      shape: decodeShape(required(flat, "shape", flat.shape)),
    }),
  },
  [GRAPH_COMMAND_TYPES.removeShape]: {
    command: (edit) => removeShape(edit.shapeId),
    encode: (edit) => ({ type: edit.type, shapeId: edit.shapeId }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.removeShape,
      shapeId: required(flat, "shapeId", flat.shapeId),
    }),
  },
  [GRAPH_COMMAND_TYPES.addShapeField]: {
    command: (edit) => addShapeField(edit.shapeId, edit.field),
    encode: (edit) => ({
      type: edit.type,
      shapeId: edit.shapeId,
      field: encodeShapeField(edit.field),
    }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.addShapeField,
      shapeId: required(flat, "shapeId", flat.shapeId),
      field: decodeShapeField(required(flat, "field", flat.field)),
    }),
  },
  [GRAPH_COMMAND_TYPES.renameShapeField]: {
    command: (edit) => renameShapeField(edit.shapeId, edit.fieldId, edit.name),
    encode: (edit) => ({
      type: edit.type,
      shapeId: edit.shapeId,
      fieldId: edit.fieldId,
      name: edit.name,
    }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.renameShapeField,
      shapeId: required(flat, "shapeId", flat.shapeId),
      fieldId: required(flat, "fieldId", flat.fieldId),
      name: required(flat, "name", flat.name),
    }),
  },
  [GRAPH_COMMAND_TYPES.setShapeFieldType]: {
    command: (edit) => setShapeFieldType(edit.shapeId, edit.fieldId, edit.fieldType),
    encode: (edit) => ({
      type: edit.type,
      shapeId: edit.shapeId,
      fieldId: edit.fieldId,
      fieldType: encodeType(edit.fieldType),
    }),
    decode: (flat) => {
      if (flat.fieldType === undefined) {
        throw new GraphEditCodecError(`A "${flat.type}" edit needs a fieldType.`);
      }
      return {
        type: GRAPH_COMMAND_TYPES.setShapeFieldType,
        shapeId: required(flat, "shapeId", flat.shapeId),
        fieldId: required(flat, "fieldId", flat.fieldId),
        fieldType: decodeType(flat.fieldType)!,
      };
    },
  },
  [GRAPH_COMMAND_TYPES.setShapeFieldDefault]: {
    command: (edit) => setShapeFieldDefault(edit.shapeId, edit.fieldId, edit.defaultValue),
    encode: (edit) => ({
      type: edit.type,
      shapeId: edit.shapeId,
      fieldId: edit.fieldId,
      defaultValue: edit.defaultValue,
    }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.setShapeFieldDefault,
      shapeId: required(flat, "shapeId", flat.shapeId),
      fieldId: required(flat, "fieldId", flat.fieldId),
      defaultValue: flat.defaultValue ?? null,
    }),
  },
  [GRAPH_COMMAND_TYPES.setShapeFieldRequired]: {
    command: (edit) => setShapeFieldRequired(edit.shapeId, edit.fieldId, edit.required),
    encode: (edit) => ({
      type: edit.type,
      shapeId: edit.shapeId,
      fieldId: edit.fieldId,
      required: edit.required,
    }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.setShapeFieldRequired,
      shapeId: required(flat, "shapeId", flat.shapeId),
      fieldId: required(flat, "fieldId", flat.fieldId),
      required: required(flat, "required", flat.required),
    }),
  },
  [GRAPH_COMMAND_TYPES.reorderShapeFields]: {
    command: (edit) => reorderShapeFields(edit.shapeId, edit.fieldIds),
    encode: (edit) => ({
      type: edit.type,
      shapeId: edit.shapeId,
      fieldIds: [...edit.fieldIds],
    }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.reorderShapeFields,
      shapeId: required(flat, "shapeId", flat.shapeId),
      fieldIds: required(flat, "fieldIds", flat.fieldIds),
    }),
  },
  [GRAPH_COMMAND_TYPES.removeShapeField]: {
    command: (edit) => removeShapeField(edit.shapeId, edit.fieldId),
    encode: (edit) => ({ type: edit.type, shapeId: edit.shapeId, fieldId: edit.fieldId }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.removeShapeField,
      shapeId: required(flat, "shapeId", flat.shapeId),
      fieldId: required(flat, "fieldId", flat.fieldId),
    }),
  },
  [GRAPH_COMMAND_TYPES.setSourceFieldDefault]: {
    command: (edit) => setSourceFieldDefault(edit.nodeId, edit.fieldPath, edit.value),
    encode: (edit) => ({
      type: edit.type,
      nodeId: edit.nodeId,
      fieldPath: [...edit.fieldPath],
      value: edit.value,
    }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.setSourceFieldDefault,
      nodeId: required(flat, "nodeId", flat.nodeId),
      fieldPath: required(flat, "fieldPath", flat.fieldPath),
      // Null clears the override, so it is a value like any other.
      value: flat.value ?? null,
    }),
  },
  [GRAPH_COMMAND_TYPES.addSceneVariable]: {
    command: (edit) => addSceneVariable(edit.sceneId, edit.variable),
    encode: (edit) => ({
      type: edit.type,
      sceneId: edit.sceneId,
      variable: encodeSceneVariable(edit.variable),
    }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.addSceneVariable,
      sceneId: required(flat, "sceneId", flat.sceneId),
      variable: decodeSceneVariable(required(flat, "variable", flat.variable)),
    }),
  },
  [GRAPH_COMMAND_TYPES.reorderSceneVariables]: {
    command: (edit) => reorderSceneVariables(edit.sceneId, edit.variableIds),
    encode: (edit) => ({
      type: edit.type,
      sceneId: edit.sceneId,
      variableIds: [...edit.variableIds],
    }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.reorderSceneVariables,
      sceneId: required(flat, "sceneId", flat.sceneId),
      variableIds: required(flat, "variableIds", flat.variableIds),
    }),
  },
  [GRAPH_COMMAND_TYPES.renameSceneVariable]: {
    command: (edit) => renameSceneVariable(edit.sceneId, edit.variableId, edit.name),
    encode: (edit) => ({
      type: edit.type,
      sceneId: edit.sceneId,
      variableId: edit.variableId,
      name: edit.name,
    }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.renameSceneVariable,
      sceneId: required(flat, "sceneId", flat.sceneId),
      variableId: required(flat, "variableId", flat.variableId),
      name: required(flat, "name", flat.name),
    }),
  },
  [GRAPH_COMMAND_TYPES.setSceneVariableType]: {
    command: (edit) => setSceneVariableType(edit.sceneId, edit.variableId, edit.variableType),
    encode: (edit) => ({
      type: edit.type,
      sceneId: edit.sceneId,
      variableId: edit.variableId,
      variableType: encodeType(edit.variableType),
    }),
    decode: (flat) => {
      // The one edit where absent and null differ: clearing a Variable's Type
      // is the point of it, so saying nothing at all is an envelope error.
      if (flat.variableType === undefined) {
        throw new GraphEditCodecError(`A "${flat.type}" edit needs a variableType.`);
      }
      return {
        type: GRAPH_COMMAND_TYPES.setSceneVariableType,
        sceneId: required(flat, "sceneId", flat.sceneId),
        variableId: required(flat, "variableId", flat.variableId),
        variableType: decodeType(flat.variableType),
      };
    },
  },
  [GRAPH_COMMAND_TYPES.removeSceneVariable]: {
    command: (edit) => removeSceneVariable(edit.sceneId, edit.variableId),
    encode: (edit) => ({
      type: edit.type,
      sceneId: edit.sceneId,
      variableId: edit.variableId,
    }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.removeSceneVariable,
      sceneId: required(flat, "sceneId", flat.sceneId),
      variableId: required(flat, "variableId", flat.variableId),
    }),
  },
  [GRAPH_COMMAND_TYPES.setDevicePairingCode]: {
    command: (edit) => setDevicePairingCode(edit.nodeId, edit.pairingCode),
    encode: (edit) => ({
      type: edit.type,
      nodeId: edit.nodeId,
      pairingCode: edit.pairingCode,
    }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.setDevicePairingCode,
      nodeId: required(flat, "nodeId", flat.nodeId),
      pairingCode: nullable(flat.pairingCode),
    }),
  },
  [GRAPH_COMMAND_TYPES.setDevicePerConnection]: {
    command: (edit) => setDevicePerConnection(edit.nodeId, edit.perConnection),
    encode: (edit) => ({
      type: edit.type,
      nodeId: edit.nodeId,
      perConnection: edit.perConnection,
    }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.setDevicePerConnection,
      nodeId: required(flat, "nodeId", flat.nodeId),
      perConnection: required(flat, "perConnection", flat.perConnection),
    }),
  },
  [GRAPH_COMMAND_TYPES.addBlock]: {
    command: (edit) => addBlock(edit.block),
    encode: (edit) => ({ type: edit.type, block: edit.block }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.addBlock,
      block: required(flat, "block", flat.block),
    }),
  },
  [GRAPH_COMMAND_TYPES.renameBlock]: {
    command: (edit) => renameBlock(edit.blockId, edit.name),
    encode: (edit) => ({ type: edit.type, blockId: edit.blockId, name: edit.name }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.renameBlock,
      blockId: required(flat, "blockId", flat.blockId),
      name: required(flat, "name", flat.name),
    }),
  },
  [GRAPH_COMMAND_TYPES.duplicateBlock]: {
    command: (edit) => duplicateBlock(edit.block, edit.block.name),
    encode: (edit) => ({ type: edit.type, block: edit.block }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.duplicateBlock,
      block: required(flat, "block", flat.block),
    }),
  },
  [GRAPH_COMMAND_TYPES.removeBlock]: {
    command: (edit) => removeBlock(edit.blockId),
    encode: (edit) => ({ type: edit.type, blockId: edit.blockId }),
    decode: (flat) => ({
      type: GRAPH_COMMAND_TYPES.removeBlock,
      blockId: required(flat, "blockId", flat.blockId),
    }),
  },
};

/** The descriptor for `type`, or null if this build has never heard of it. */
export function graphEditCodec(type: string): GraphEditCodec<GraphEdit["type"]> | null {
  const codec = (
    GRAPH_EDIT_CODECS as Record<string, GraphEditCodec<GraphEdit["type"]> | undefined>
  )[type];
  return codec ?? null;
}

/** `edit` as the flat record the wire carries. */
export function encodeGraphEdit(edit: GraphEdit): FlatGraphEdit {
  // Safe by construction: the record is keyed by exactly this union, and each
  // descriptor's `encode` takes exactly the variant its key selects. What the
  // compiler can't do is correlate the two through a value, hence the cast.
  const codec = GRAPH_EDIT_CODECS[edit.type] as GraphEditCodec<GraphEdit["type"]>;
  return codec.encode(edit);
}

/**
 * One flat record as the edit it describes.
 *
 * Throws `GraphEditCodecError` for a type this build doesn't know, or for an
 * edit missing a field its type needs — never a partial edit, because a
 * caller that applied half a batch would leave its peer believing in a graph
 * nobody has.
 */
export function decodeGraphEdit(flat: FlatGraphEdit): GraphEdit {
  const codec = graphEditCodec(flat.type);
  if (!codec) throw new GraphEditCodecError(`Unknown Show graph edit "${flat.type}".`);
  return codec.decode(flat);
}

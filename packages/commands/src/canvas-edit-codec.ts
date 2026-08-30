// The one place a Canvas workspace edit becomes a flat wire record and back
// (#436), the Canvas counterpart to ./graph-edit-codec.
//
// Canvas edits used to be flattened by hand at two surfaces that had no way to
// disagree politely: studio's `toEditInput` switch and the api's
// `parseCanvasEdit` switch. Adding a variant meant remembering both, and
// nothing failed if you didn't.
//
// So there is one descriptor per edit type here — `encode` and `decode`
// together — in records mapped over `CanvasEdit["type"]` and
// `ArtboardEdit["type"]`. A variant with no descriptor doesn't compile, and
// `decode(encode(edit))` is a test rather than a hope
// (./canvas-edit-codec.test.ts).
//
// Two edit vocabularies, deliberately: an Artboard has a place on the Canvas
// Editor's plane, while the Canvas it presents has an Element tree
// (CONTEXT.md). `CANVAS_EDIT_CODECS` covers Element membership, Properties,
// parentage, and stacking order, and knows nothing of framing; asking it to
// decode `artboard.move` fails, which is the point.
//
// As with the graph codec, this module decides neither who may send what nor
// how a rejection reaches a person. Envelope violations throw
// `CanvasEditCodecError`; the api adapter turns that into a `BAD_USER_INPUT`
// GraphQLError, and nothing here imports GraphQL.

import type { Position } from "@mechane/domain";

import {
  ARTBOARD_COMMAND_TYPES,
  CANVAS_COMMAND_TYPES,
  type ArtboardEdit,
  type CanvasEdit,
  type ElementProperties,
  type NewElement,
} from "./canvas-edits";
import type { CanvasWorkspaceEdit, CanvasWorkspaceEditPayload } from "./canvas-commands";

/** An edit that named a field its `type` needs, or named nothing at all. */
export class CanvasEditCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasEditCodecError";
  }
}

/**
 * One workspace edit as a flat record: the shape both adapters exchange.
 *
 * Every field is optional for the same reason it is optional in the SDL —
 * GraphQL has no input unions (ADR-0007, ADR-0008), so `type` decides which
 * fields are read. `canvasId` is not: every variant names the Canvas it
 * targets, whether it edits that Canvas's content or its Artboard's framing.
 */
export interface FlatCanvasEdit {
  type: string;
  canvasId: string;
  elementId?: string | null;
  parentId?: string | null;
  rank?: string | null;
  element?: Record<string, unknown> | null;
  properties?: Record<string, unknown> | null;
  unsetProperties?: string[] | null;
  position?: Position | null;
}

/** The flat payload of one edit, before the Canvas id is attached. */
type FlatPayload = Omit<FlatCanvasEdit, "canvasId">;

// ---------------------------------------------------------------------------
// Envelope reads
// ---------------------------------------------------------------------------

function required<T>(flat: FlatPayload, field: string, value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new CanvasEditCodecError(`A "${flat.type}" edit needs "${field}".`);
  }
  return value;
}

function requiredString(flat: FlatPayload, field: string, value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CanvasEditCodecError(`A "${flat.type}" edit needs a non-empty "${field}".`);
  }
  return value;
}

function requiredRecord(flat: FlatPayload, field: string, value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CanvasEditCodecError(`A "${flat.type}" edit needs the "${field}" object.`);
  }
  return value as Record<string, unknown>;
}

function requiredPosition(flat: FlatPayload): Position {
  const value = requiredRecord(flat, "position", flat.position);
  if (typeof value.x !== "number" || typeof value.y !== "number") {
    throw new CanvasEditCodecError(`A "${flat.type}" edit needs a numeric position.`);
  }
  return { x: value.x, y: value.y };
}

function decodeNewElement(flat: FlatPayload): NewElement {
  const element = requiredRecord(flat, "element", flat.element);
  // Only the identity fields are read here. What may live beside them is the
  // Property catalog's business (#439), and `applyCanvasEdits` rejects an
  // Element whose kind it doesn't know.
  requiredString(flat, "element id", element.id);
  requiredString(flat, "element type", element.type);
  return element as unknown as NewElement;
}

function decodeUnsetProperties(flat: FlatPayload): readonly string[] | undefined {
  const value = flat.unsetProperties;
  if (value === null || value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((property) => typeof property !== "string")) {
    throw new CanvasEditCodecError(`A "${flat.type}" edit's unsetProperties must all be strings.`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// The descriptor records
// ---------------------------------------------------------------------------

/** Both halves of one edit type's flattening, in one place. */
export interface EditCodec<Edit> {
  readonly encode: (edit: Edit) => FlatPayload;
  readonly decode: (flat: FlatPayload) => Edit;
}

type CanvasEditOf<T extends CanvasEdit["type"]> = Extract<CanvasEdit, { type: T }>;
type ArtboardEditOf<T extends ArtboardEdit["type"]> = Extract<ArtboardEdit, { type: T }>;

/**
 * Canvas *content* only: Element membership, Properties, parentage, and
 * stacking order. The mapped type is the exhaustiveness check — a `CanvasEdit`
 * variant with no entry here is a compile error.
 */
export const CANVAS_EDIT_CODECS: {
  [T in CanvasEdit["type"]]: EditCodec<CanvasEditOf<T>>;
} = {
  [CANVAS_COMMAND_TYPES.addElement]: {
    encode: (edit) => ({
      type: edit.type,
      element: edit.element as unknown as Record<string, unknown>,
      parentId: edit.parentId,
      rank: edit.rank,
    }),
    decode: (flat) => ({
      type: CANVAS_COMMAND_TYPES.addElement,
      element: decodeNewElement(flat),
      parentId: requiredString(flat, "parentId", flat.parentId),
      rank: requiredString(flat, "rank", flat.rank),
    }),
  },
  [CANVAS_COMMAND_TYPES.removeElement]: {
    encode: (edit) => ({ type: edit.type, elementId: edit.elementId }),
    decode: (flat) => ({
      type: CANVAS_COMMAND_TYPES.removeElement,
      elementId: requiredString(flat, "elementId", flat.elementId),
    }),
  },
  [CANVAS_COMMAND_TYPES.updateElement]: {
    encode: (edit) => ({
      type: edit.type,
      elementId: edit.elementId,
      properties: edit.properties,
      // Absent and empty mean different things to a reader, so an edit that
      // unsets nothing carries no list rather than an empty one.
      ...(edit.unsetProperties ? { unsetProperties: [...edit.unsetProperties] } : {}),
    }),
    decode: (flat) => {
      const unsetProperties = decodeUnsetProperties(flat);
      return {
        type: CANVAS_COMMAND_TYPES.updateElement,
        elementId: requiredString(flat, "elementId", flat.elementId),
        properties: required(flat, "properties", flat.properties) as ElementProperties,
        ...(unsetProperties ? { unsetProperties } : {}),
      };
    },
  },
  [CANVAS_COMMAND_TYPES.reparentElement]: {
    encode: (edit) => ({
      type: edit.type,
      elementId: edit.elementId,
      parentId: edit.parentId,
      rank: edit.rank,
    }),
    decode: (flat) => ({
      type: CANVAS_COMMAND_TYPES.reparentElement,
      elementId: requiredString(flat, "elementId", flat.elementId),
      parentId: requiredString(flat, "parentId", flat.parentId),
      rank: requiredString(flat, "rank", flat.rank),
    }),
  },
};

/** Artboard *framing*, which is not Canvas content. */
export const ARTBOARD_EDIT_CODECS: {
  [T in ArtboardEdit["type"]]: EditCodec<ArtboardEditOf<T>>;
} = {
  [ARTBOARD_COMMAND_TYPES.move]: {
    encode: (edit) => ({ type: edit.type, position: { ...edit.position } }),
    decode: (flat) => ({ type: ARTBOARD_COMMAND_TYPES.move, position: requiredPosition(flat) }),
  },
};

function canvasEditCodec(type: string): EditCodec<CanvasEdit> | null {
  const codec = (CANVAS_EDIT_CODECS as Record<string, EditCodec<CanvasEdit> | undefined>)[type];
  return codec ?? null;
}

function artboardEditCodec(type: string): EditCodec<ArtboardEdit> | null {
  const codec = (ARTBOARD_EDIT_CODECS as Record<string, EditCodec<ArtboardEdit> | undefined>)[type];
  return codec ?? null;
}

/** Whether `type` names an edit this codec owns, rather than a graph edit. */
export function isCanvasWorkspaceEditType(type: string): boolean {
  return canvasEditCodec(type) !== null || artboardEditCodec(type) !== null;
}

/** `edit` as the flat record the wire carries. */
export function encodeCanvasWorkspaceEdit(edit: CanvasWorkspaceEdit): FlatCanvasEdit {
  const payload = edit.edit;
  // Safe by construction: each record is keyed by exactly its own union, and
  // each descriptor's `encode` takes exactly the variant its key selects. What
  // the compiler can't do is correlate the two through a value.
  const codec =
    (canvasEditCodec(payload.type) as EditCodec<CanvasWorkspaceEditPayload> | null) ??
    (artboardEditCodec(payload.type) as EditCodec<CanvasWorkspaceEditPayload> | null);
  if (!codec) throw new CanvasEditCodecError(`Unknown Canvas workspace edit "${payload.type}".`);
  return { ...codec.encode(payload), canvasId: edit.canvasId };
}

/**
 * One flat record as the workspace edit it describes.
 *
 * Throws `CanvasEditCodecError` for a type this build doesn't know, or for an
 * edit missing a field its type needs — never a partial edit, because a caller
 * that applied half a batch would leave its peer believing in a Canvas nobody
 * has.
 */
export function decodeCanvasWorkspaceEdit(flat: FlatCanvasEdit): CanvasWorkspaceEdit {
  const codec =
    (canvasEditCodec(flat.type) as EditCodec<CanvasWorkspaceEditPayload> | null) ??
    (artboardEditCodec(flat.type) as EditCodec<CanvasWorkspaceEditPayload> | null);
  if (!codec) throw new CanvasEditCodecError(`Unknown Canvas workspace edit "${flat.type}".`);
  if (typeof flat.canvasId !== "string" || flat.canvasId.length === 0) {
    throw new CanvasEditCodecError(`A "${flat.type}" edit needs a canvasId.`);
  }
  return { canvasId: flat.canvasId, edit: codec.decode(flat) };
}

/**
 * One flat record as a Canvas *content* edit.
 *
 * `artboard.move` is rejected here rather than quietly accepted: framing is
 * not content, and a caller reaching for Canvas content should not receive an
 * Artboard move by accident.
 */
export function decodeCanvasEdit(flat: FlatCanvasEdit): CanvasEdit {
  const codec = canvasEditCodec(flat.type);
  if (!codec) {
    throw new CanvasEditCodecError(
      artboardEditCodec(flat.type)
        ? `"${flat.type}" edits an Artboard's framing, not Canvas content.`
        : `Unknown Canvas edit "${flat.type}".`,
    );
  }
  return codec.decode(flat);
}

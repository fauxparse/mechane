// The server end of the Canvas transport seam (#436, ADR-0014).
//
// Outbound only, and thin on purpose: a stored Canvas tree becomes the flat
// Element list the schema exposes — the exact inverse of what
// `@mechane/graphql-schema`'s `decodeCanvasDocument` does at the clients.
// Inbound, `@mechane/commands`' `decodeCanvasWorkspaceEdit` is the one
// decoder; what stays at ./schema.ts is this end's policy — how a rejection
// reaches a person — because nothing in the codec imports GraphQL. The
// hand-written `parseCanvasEdit` switch that used to live here was the second
// half of a pair nothing checked for agreement (#436).
import type { Element } from "@mechane/domain";
import type { StoredCanvas } from "../db/canvas";

const ELEMENT_TYPE_NAMES = {
  rect: "RectElement",
  ellipse: "EllipseElement",
  text: "TextElement",
  image: "ImageElement",
  frame: "FrameElement",
  slot: "SlotElement",
} as const;

type CanvasElementDiscriminator = { type: keyof typeof ELEMENT_TYPE_NAMES };

export function resolveCanvasElementType(element: CanvasElementDiscriminator): string {
  return ELEMENT_TYPE_NAMES[element.type];
}

type SerializedElement = Record<string, unknown> & {
  id: string;
  type: keyof typeof ELEMENT_TYPE_NAMES;
  parentId: string | null;
  rank: string;
};

/**
 * The stored tree as one flat list, parent and rank carried on every Element.
 *
 * Rank has to travel as data: it is the authoritative sibling and stacking
 * order (CONTEXT.md), and a flat list gives a client nothing else to sort on.
 */
export function flattenCanvasElements(
  element: Element,
  parentId: string | null = null,
  into: SerializedElement[] = [],
): SerializedElement[] {
  const { children, ...fields } = element;
  into.push({
    ...fields,
    id: element.id,
    type: element.type,
    parentId,
    rank: element.rank ?? "",
  });
  for (const child of children ?? []) flattenCanvasElements(child, element.id, into);
  return into;
}

export function serializeCanvas(canvas: StoredCanvas) {
  return {
    id: canvas.id,
    kind: canvas.kind,
    elements: flattenCanvasElements(canvas.root),
  };
}

/** A stored Canvas as the Artboard document that presents it. */
export function serializeArtboard(canvas: StoredCanvas) {
  return {
    canvas: serializeCanvas(canvas),
    ownerId: canvas.ownerId,
    ownerName: canvas.ownerName,
    position: canvas.position,
  };
}

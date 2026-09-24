// The Canvas slice: the server end of the Canvas transport seam (#436,
// ADR-0014) — the SDL for Canvas documents and their Artboards, the
// Element interface resolution, and the workspace query that serves them.
//
// Serialization is outbound only: a stored Canvas tree becomes the flat
// Element list the schema exposes — the exact inverse of what
// `@mechane/graphql-schema`'s `decodeCanvasDocument` does at the clients.
// Inbound edit policy lives with the Show graph slice.
import type { Element } from "@mechane/domain/canvas";

import { readCanvasWorkspace, type StoredCanvas } from "../db/canvas";
import type { GraphQLContext, Resolvers } from "./context";
import { requireUserId } from "./context";
import { findOwnShowOrThrow, validGraphState } from "./show";

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

export const typeDefs = /* GraphQL */ `
    """
    A persisted Scene or Block Canvas (ADR-0014).

    Elements arrive flat, each naming its parent and its rank, because a
    Canvas hierarchy has no authored depth limit and a recursive selection
    always has one. Clients rebuild the tree; \`@mechane/graphql-schema\`'s
    \`decodeCanvasDocument\` is the one decoder that does it. Element stays an
    interface so clients can select the primitive-specific content without a
    nullable field bag.
    """
    type Canvas {
      id: ID!
      kind: String!
      "Exactly one Element has no parent, and it is the root Frame."
      elements: [Element!]!
    }

    """
    One Canvas as it is placed on the Canvas Editor's plane.

    Framing, not content: an Artboard has a place and a size, while the Canvas
    it presents has an Element tree (CONTEXT.md). Owner identity lives here for
    the same reason — the Canvas editor works on a Canvas without knowing
    whether a Scene or a Block owns it.
    """
    type Artboard {
      canvas: Canvas!
      ownerId: ID!
      ownerName: String!
      position: Position!
    }

    interface Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: JSON!
      layout: JSON
      sizing: JSON
      opacity: JSON
      blendMode: String
      fill: JSON
      stroke: JSON
      anchor: JSON
      alignSelf: String
    }

    type RectElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: JSON!
      layout: JSON
      sizing: JSON
      opacity: JSON
      blendMode: String
      fill: JSON
      stroke: JSON
      anchor: JSON
      alignSelf: String
      cornerRadius: JSON
    }

    type EllipseElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: JSON!
      layout: JSON
      sizing: JSON
      opacity: JSON
      blendMode: String
      fill: JSON
      stroke: JSON
      anchor: JSON
      alignSelf: String
    }

    type TextElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: JSON!
      layout: JSON
      sizing: JSON
      opacity: JSON
      blendMode: String
      fill: JSON
      stroke: JSON
      anchor: JSON
      alignSelf: String
      content: JSON
      color: JSON
      fontFamily: JSON
      fontSize: JSON
      fontWeight: JSON
      fontStyle: JSON
      textDecoration: JSON
      lineHeight: JSON
      letterSpacing: JSON
      textAlign: JSON
      textVerticalAlign: JSON
      textOverflow: String
      padding: JSON
    }

    type ImageElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: JSON!
      layout: JSON
      sizing: JSON
      opacity: JSON
      blendMode: String
      fill: JSON
      stroke: JSON
      anchor: JSON
      alignSelf: String
      image: JSON
      alt: JSON
      objectFit: JSON
      objectPosition: JSON
      cornerRadius: JSON
    }

    type FrameElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: JSON!
      layout: JSON
      sizing: JSON
      opacity: JSON
      blendMode: String
      fill: JSON
      stroke: JSON
      anchor: JSON
      alignSelf: String
      cornerRadius: JSON
      layoutMode: String
      direction: String
      gap: JSON
      padding: JSON
      alignPrimary: String
      alignCounter: String
      clip: Boolean
    }

    type SlotElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: JSON!
      layout: JSON
      sizing: JSON
      opacity: JSON
      blendMode: String
      fill: JSON
      stroke: JSON
      anchor: JSON
      alignSelf: String
      layoutMode: String
      direction: String
      gap: JSON
      padding: JSON
      alignPrimary: String
      alignCounter: String
      clip: Boolean
      blockId: ID!
      assignments: JSON
      expansion: JSON
    }

    type Query {
      showCanvases(showId: ID!, state: String): [Artboard!]!
    }
`;

export const resolvers: Resolvers = {
  Element: {
    __resolveType: resolveCanvasElementType,
  },
  Query: {
    showCanvases: async (
      _parent,
      { showId, state }: { showId: string; state?: string | null },
      context: GraphQLContext,
    ) => {
      const userId = requireUserId(context);
      await findOwnShowOrThrow(showId, userId);
      const workspace = await readCanvasWorkspace(showId, validGraphState(state ?? "draft"));
      return workspace.canvases.map(serializeArtboard);
    },
  },
};

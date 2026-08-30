// The one place a GraphQL Canvas read becomes a domain Canvas (#436, ADR-0014).
//
// A Canvas hierarchy has no authored depth limit, but a recursive GraphQL
// selection always has a finite one: the old `root { children { children …` }
// document capped Canvases at five levels and silently truncated anything
// deeper. So Canvas reads expose a flat, typed Element list carrying parent
// identity and rank, and this module reconstructs the tree — which is a thing
// a decoder can do without a depth cap, and a selection set cannot.
//
// The Elements stay typed. A JSON scalar would have carried arbitrary depth
// too, at the cost of GraphQL's per-kind Element types and every client's
// ability to select by kind; the `Element` interface with one concrete type
// per kind is worth keeping.
//
// Studio and Player both call `decodeCanvasDocument`, which is the point: the
// recursive decoder used to exist three times (studio's Canvas api, studio's
// graph boundary, and the Player's mappers), each with its own `as unknown as
// Element`. What stays at the hosts is direction and user-facing error policy;
// what a *malformed* Canvas is, is decided here, once, and reported
// structurally so a host can word it for its own reader.
//
// Owner and Artboard facts are deliberately not in the return value: an
// Artboard is framing, not Canvas content (CONTEXT.md), and the Player has no
// Artboards at all. They stay on the `Artboard` document beside the Canvas,
// where a caller that wants them reads them directly.

import type { Canvas, Element, ElementKind, FrameElement } from "@mechane/domain";
import { assertValidCanvas, ELEMENT_KINDS, InvalidCanvasError } from "@mechane/domain";
import type { TadaDocumentNode } from "gql.tada";
import { graphql } from "./graphql";

/**
 * Every field a Canvas Element carries, in one fragment.
 *
 * It no longer recurses — the tree is rebuilt from `parentId` and `rank` — so
 * a field added here reaches every Element at every depth, rather than the
 * first five.
 */
export const CanvasElementFields = graphql(`
  fragment CanvasElementFields on Element {
    __typename
    id
    name
    parentId
    rank
    hidden
    layout
    sizing
    opacity
    blendMode
    fill
    stroke
    anchor
    alignSelf
    ... on RectElement {
      cornerRadius
    }
    ... on TextElement {
      content
      color
      fontFamily
      fontSize
      fontWeight
      fontStyle
      textDecoration
      lineHeight
      letterSpacing
      textAlign
      textVerticalAlign
      textOverflow
      padding
    }
    ... on ImageElement {
      image
      alt
      objectFit
      objectPosition
      cornerRadius
    }
    ... on FrameElement {
      cornerRadius
      layoutMode
      direction
      gap
      padding
      alignPrimary
      alignCounter
      clip
    }
    ... on SlotElement {
      blockId
      assignments
      expansion
      layoutMode
      direction
      gap
      padding
      alignPrimary
      alignCounter
      clip
    }
  }
`);

// ---------------------------------------------------------------------------
// Document shapes
// ---------------------------------------------------------------------------

/** One Element off the wire: a typename, its place in the tree, and its Properties. */
export interface CanvasElementDocument {
  readonly __typename?: string;
  readonly id?: unknown;
  readonly parentId?: unknown;
  readonly rank?: unknown;
  readonly [field: string]: unknown;
}

export interface CanvasDocument {
  readonly id?: unknown;
  readonly kind?: unknown;
  readonly elements?: unknown;
}

export interface ArtboardDocument {
  readonly ownerId: string;
  readonly ownerName: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly canvas: CanvasDocument;
}

export interface GetShowCanvasesResult {
  readonly showCanvases: readonly ArtboardDocument[];
}

export interface GetShowCanvasesVariables {
  readonly showId: string;
  readonly state?: string | null;
}

export const GetShowCanvasesQuery: TadaDocumentNode<
  GetShowCanvasesResult,
  GetShowCanvasesVariables
> = graphql(
  `
    query GetShowCanvases($showId: ID!, $state: String) {
      showCanvases(showId: $showId, state: $state) {
        ownerId
        ownerName
        position {
          x
          y
        }
        canvas {
          id
          kind
          elements {
            ...CanvasElementFields
          }
        }
      }
    }
  `,
  [CanvasElementFields],
);

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/** Why a Canvas document was refused, as something a host can branch on. */
export type CanvasDocumentErrorCode =
  | "malformed-document"
  | "unknown-element-kind"
  | "duplicate-element-id"
  | "missing-parent"
  | "no-root"
  | "multiple-roots"
  | "root-not-frame"
  | "unreachable-element"
  | "duplicate-sibling-rank"
  | "invalid-canvas";

/**
 * A Canvas that cannot be reconstructed from what the wire carried.
 *
 * Structured rather than prose because the same failure reaches a Studio user
 * mid-edit and a Player mid-performance, and those two deserve different
 * words. The message is the fallback, not the interface.
 */
export class CanvasDocumentError extends Error {
  readonly code: CanvasDocumentErrorCode;
  readonly canvasId: string | null;
  readonly elementId: string | null;

  constructor(
    code: CanvasDocumentErrorCode,
    message: string,
    context: { canvasId?: string | null; elementId?: string | null } = {},
  ) {
    super(message);
    this.name = "CanvasDocumentError";
    this.code = code;
    this.canvasId = context.canvasId ?? null;
    this.elementId = context.elementId ?? null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The typename → kind conversion, kept beside the schema it mirrors
 * (ADR-0007, ADR-0008). Derived from the domain's own kind list so a new
 * Element kind is one edit, not two that can disagree.
 */
const ELEMENT_KIND_BY_TYPENAME: ReadonlyMap<string, ElementKind> = new Map(
  ELEMENT_KINDS.map((kind) => [`${kind[0]!.toUpperCase()}${kind.slice(1)}Element`, kind]),
);

function elementKind(typename: unknown, canvasId: string | null): ElementKind {
  const kind = typeof typename === "string" ? ELEMENT_KIND_BY_TYPENAME.get(typename) : undefined;
  if (!kind) {
    throw new CanvasDocumentError(
      "unknown-element-kind",
      `Unknown Canvas Element type "${String(typename)}".`,
      { canvasId },
    );
  }
  return kind;
}

type DecodedElement = {
  element: Record<string, unknown>;
  parentId: string | null;
  rank: string;
};

function decodeElement(input: unknown, canvasId: string | null): DecodedElement {
  if (!isRecord(input)) {
    throw new CanvasDocumentError("malformed-document", "Every Canvas Element must be an object.", {
      canvasId,
    });
  }
  const { __typename, id, parentId, rank, ...properties } = input;
  if (typeof id !== "string" || id.length === 0) {
    throw new CanvasDocumentError("malformed-document", "Every Canvas Element requires an id.", {
      canvasId,
    });
  }
  if (parentId !== null && parentId !== undefined && typeof parentId !== "string") {
    throw new CanvasDocumentError(
      "malformed-document",
      `Element "${id}" has a parentId that is not an id.`,
      { canvasId, elementId: id },
    );
  }
  return {
    element: {
      // A GraphQL field a Canvas never set comes back as null; the domain says
      // "absent" with an absent key, so nulls are dropped rather than carried
      // through as values no Property means.
      ...Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== null)),
      id,
      type: elementKind(__typename, canvasId),
      ...(typeof rank === "string" ? { rank } : {}),
    },
    parentId: typeof parentId === "string" && parentId.length > 0 ? parentId : null,
    rank: typeof rank === "string" ? rank : "",
  };
}

/**
 * One Canvas document as the Canvas the editor and renderer share.
 *
 * Rejects, rather than repairs: an unknown Element kind, a duplicate Element
 * id, a parent that isn't in the list, no parentless Element or more than one,
 * a parentless Element that isn't a Frame, an Element unreachable from the
 * root (a cycle, among other shapes), duplicate ranks among siblings, and
 * everything `assertValidCanvas` already refuses. Half a Canvas is worse than
 * none: a Player painting a truncated Scene mid-performance shows the audience
 * a lie.
 */
export function decodeCanvasDocument(document: CanvasDocument | unknown): Canvas {
  if (!isRecord(document)) {
    throw new CanvasDocumentError("malformed-document", "A Canvas document must be an object.");
  }
  const canvasId = typeof document.id === "string" ? document.id : null;
  const elements = document.elements;
  if (!Array.isArray(elements)) {
    throw new CanvasDocumentError(
      "malformed-document",
      "A Canvas document must carry an Element list.",
      { canvasId },
    );
  }

  const decoded = new Map<string, DecodedElement>();
  for (const input of elements) {
    const entry = decodeElement(input, canvasId);
    const id = entry.element.id as string;
    if (decoded.has(id)) {
      throw new CanvasDocumentError(
        "duplicate-element-id",
        `Canvas Element id "${id}" is duplicated.`,
        { canvasId, elementId: id },
      );
    }
    decoded.set(id, entry);
  }

  const childrenByParent = new Map<string, DecodedElement[]>();
  let root: DecodedElement | null = null;
  for (const entry of decoded.values()) {
    const id = entry.element.id as string;
    if (entry.parentId === null) {
      if (root) {
        throw new CanvasDocumentError(
          "multiple-roots",
          `Canvas has more than one parentless Element ("${root.element.id as string}" and "${id}").`,
          { canvasId, elementId: id },
        );
      }
      root = entry;
      continue;
    }
    if (!decoded.has(entry.parentId)) {
      throw new CanvasDocumentError(
        "missing-parent",
        `Canvas Element "${id}" names a parent "${entry.parentId}" that the Canvas does not contain.`,
        { canvasId, elementId: id },
      );
    }
    const siblings = childrenByParent.get(entry.parentId) ?? [];
    siblings.push(entry);
    childrenByParent.set(entry.parentId, siblings);
  }

  if (!root) {
    throw new CanvasDocumentError("no-root", "A Canvas requires exactly one root Frame.", {
      canvasId,
    });
  }
  if (root.element.type !== "frame") {
    throw new CanvasDocumentError("root-not-frame", "The Canvas root must be a Frame.", {
      canvasId,
      elementId: root.element.id as string,
    });
  }

  // Rank is the authoritative sibling and stacking order (CONTEXT.md), so it
  // is sorted on rather than trusted to arrive in order. Duplicate ranks are a
  // refusal, not a tie to break: which of two Elements paints on top would
  // otherwise depend on the order rows came back in.
  const visited = new Set<string>();
  const build = (entry: DecodedElement): Element => {
    const id = entry.element.id as string;
    visited.add(id);
    const siblings = childrenByParent.get(id) ?? [];
    const ranks = new Set<string>();
    for (const sibling of siblings) {
      if (ranks.has(sibling.rank)) {
        throw new CanvasDocumentError(
          "duplicate-sibling-rank",
          `Siblings under Canvas Element "${id}" share the rank "${sibling.rank}".`,
          { canvasId, elementId: id },
        );
      }
      ranks.add(sibling.rank);
    }
    const children = siblings.slice().sort((left, right) => left.rank.localeCompare(right.rank));
    return {
      ...entry.element,
      ...(children.length > 0 ? { children: children.map(build) } : {}),
    } as unknown as Element;
  };
  const tree = build(root) as FrameElement;

  if (visited.size !== decoded.size) {
    const orphan = [...decoded.keys()].find((id) => !visited.has(id))!;
    throw new CanvasDocumentError(
      "unreachable-element",
      `Canvas Element "${orphan}" is not reachable from the root Frame.`,
      { canvasId, elementId: orphan },
    );
  }

  const kind = document.kind === "block" ? "block" : "scene";
  try {
    return assertValidCanvas({ kind, root: tree });
  } catch (error) {
    if (error instanceof InvalidCanvasError) {
      throw new CanvasDocumentError("invalid-canvas", error.message, { canvasId });
    }
    throw error;
  }
}

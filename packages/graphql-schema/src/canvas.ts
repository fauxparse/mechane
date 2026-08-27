import { graphql } from "./graphql";
import type { TadaDocumentNode } from "gql.tada";

/**
 * The Canvas Element interface is expanded explicitly because GraphQL
 * fragments cannot recurse. Six levels covers authored fixtures while keeping
 * this document statically typed and bounded.
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
    rotation
    opacity
    blendMode
    fill
    stroke
    anchor
    ... on RectElement {
      cornerRadius
    }
    ... on TextElement {
      content
      text
      color
      fontFamily
      fontSize
      fontWeight
      fontStyle
      textDecoration
      lineHeight
      letterSpacing
      textVerticalAlign
      textOverflow
      padding
    }
    ... on ImageElement {
      image
      alt
      objectFit
    }
    ... on FrameElement {
      cornerRadius
      layoutMode
      autoLayout
      direction
      gap
      padding
      alignPrimary
      alignCounter
      primaryAlign
      counterAlign
      clip
    }
    ... on SlotElement {
      blockId
      layoutMode
      autoLayout
      direction
      gap
      padding
      alignPrimary
      alignCounter
      primaryAlign
      counterAlign
      clip
    }
  }
`);

export interface CanvasElementDocument {
  readonly __typename?: string;
  readonly children?: readonly CanvasElementDocument[];
  readonly [field: string]: unknown;
}

export interface ShowCanvasDocument {
  readonly id: string;
  readonly kind: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly root: CanvasElementDocument;
}

export interface GetShowCanvasesResult {
  readonly showCanvases: readonly ShowCanvasDocument[];
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
        id
        kind
        ownerId
        ownerName
        position {
          x
          y
        }
        root {
          ...CanvasElementFields
          children {
            ...CanvasElementFields
            children {
              ...CanvasElementFields
              children {
                ...CanvasElementFields
                children {
                  ...CanvasElementFields
                }
              }
            }
          }
        }
      }
    }
  `,
  [CanvasElementFields],
);

export type ShowCanvas = ShowCanvasDocument;

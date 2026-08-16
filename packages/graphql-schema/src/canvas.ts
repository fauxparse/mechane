import { graphql } from "./graphql";
import type { ResultOf } from "gql.tada";

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
    width
    height
    minWidth
    maxWidth
    minHeight
    maxHeight
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
      src
      image
      source
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
  }
`);

export const GetShowCanvasesQuery = graphql(
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

export type ShowCanvas = ResultOf<typeof GetShowCanvasesQuery>["showCanvases"][number];

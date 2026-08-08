import { graphql } from "./graphql";
import type { ResultOf } from "gql.tada";

// The API exposes Elements as a GraphQL interface. The repeated child
// selection keeps the document acyclic while supporting the nested trees the
// editor stores; the API validates the complete tree before returning it.
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
      lineHeight
      letterSpacing
      textAlign
    }
    ... on ImageElement {
      src
      image
      source
      alt
      objectFit
    }
    ... on FrameElement {
      layoutMode
      mode
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

export const GetSceneCanvasQuery = graphql(
  `
    query GetSceneCanvas($showId: ID!, $sceneNodeId: ID!, $state: String) {
      sceneCanvas(showId: $showId, sceneNodeId: $sceneNodeId, state: $state) {
        id
        kind
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

export type SceneCanvas = ResultOf<typeof GetSceneCanvasQuery>["sceneCanvas"];

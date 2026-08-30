import { graphql } from "./graphql";
import { CanvasElementFields } from "./canvas";
import type { TadaDocumentNode } from "gql.tada";
const PlayerGraphFields = graphql(`
  fragment PlayerGraphFields on ShowGraph {
    showId
    state
    updatedAt
    version
    sourceFieldDefaults {
      nodeId
      fieldPath
      value
    }
    nodes {
      __typename
      id
      name
      parentId
      position {
        x
        y
      }
      color
      ... on SceneNode {
        variables {
          id
          name
          rank
          type {
            kind
            shapeId
            of {
              kind
              shapeId
            }
          }
          suggestedDimensions {
            width
            height
          }
        }
      }
      ... on FlowNode {
        defaultSceneId
      }
      ... on SourceNode {
        sourceType: type {
          kind
          shapeId
          of {
            kind
            shapeId
          }
        }
      }
      ... on TransformerNode {
        transformerType: type {
          kind
          shapeId
          of {
            kind
            shapeId
          }
        }
      }
      ... on DeviceNode {
        perConnection
        pairingCode
      }
    }
    edges {
      __typename
      id
      sourceId
      targetId
      sourcePath
      targetPath
      ... on WiringEdge {
        fieldMapping
        targetVariableId
      }
      ... on NavigateEdge {
        cueId
        actionId
      }
    }
    shapes {
      id
      name
      fields {
        id
        name
        position
        required
        type {
          kind
          shapeId
          of {
            kind
            shapeId
          }
        }
      }
    }
  }
`);

export const GetPlayerSessionQuery: TadaDocumentNode<any, any> = graphql(
  `
    query GetPlayerSession($pairingCode: String!) {
      playerSession(pairingCode: $pairingCode) {
        device {
          id
          name
          perConnection
        }
        run {
          id
          showId
          status
          startedAt
          endedAt
          sourceValues
        }
        graph {
          ...PlayerGraphFields
        }
        scene {
          __typename
          id
          name
          parentId
          position {
            x
            y
          }
          color
          variables {
            id
            name
            rank
            type {
              kind
              shapeId
              of {
                kind
                shapeId
              }
            }
            suggestedDimensions {
              width
              height
            }
          }
        }
        canvas {
          id
          kind
          elements {
            ...CanvasElementFields
          }
        }
        blocks {
          id
          name
          canvas {
            id
            kind
            elements {
              ...CanvasElementFields
            }
          }
          variables {
            id
            name
            required
            type {
              kind
              shapeId
              of {
                kind
                shapeId
              }
            }
            defaultValue
          }
          states {
            id
            name
            isDefault
            overrides {
              elementId
              property
              value
            }
          }
          stateSelectorVariableId
        }
        imageAssets {
          id
          revision
          url
          width
          height
          mimeType
          alt
          blurHash
        }
      }
    }
  `,
  [PlayerGraphFields, CanvasElementFields],
);

import { graphql } from "./graphql";
import { CanvasElementFields } from "./canvas";
import type { TadaDocumentNode } from "gql.tada";
const PlayerGraphFields = graphql(`
  fragment PlayerGraphFields on ShowGraph {
    showId
    state
    updatedAt
    version
    cues {
      id
      name
      ownerKind
      sceneId
      blockId
      actionIds
    }
    actions {
      id
      cueId
      kind
      targetSceneId
    }
    eventBindings {
      id
      canvasId
      elementId
      eventKind
      params
      cueId
      position
    }
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
        conversion
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

const PlayerFlowSceneFields = graphql(`
  fragment PlayerFlowSceneFields on SceneNode {
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
`);

export const GetPlayerSessionQuery: TadaDocumentNode<any, any> = graphql(
  `
    query GetPlayerSession {
      playerSession {
        device {
          name
          perConnection
        }
        realtime {
          channel
          grant
          expiresAt
        }
        run {
          id
          showId
          status
          startedAt
          endedAt
          stateSequence
          sourceValues
          structuredValues
        }
        graph {
          ...PlayerGraphFields
        }
        flow {
          flowId
          defaultSceneId
          scenes {
            scene {
              ...PlayerFlowSceneFields
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
  [PlayerGraphFields, PlayerFlowSceneFields, CanvasElementFields],
);

export const SubmitPlayerEventMutation: TadaDocumentNode<any, any> = graphql(`
  mutation SubmitPlayerEvent($input: PlayerEventInput!) {
    submitPlayerEvent(input: $input) {
      __typename
      ... on PlayerEventApplied {
        eventId
        appliedResultingSceneId: resultingSceneId
        changed
      }
      ... on PlayerEventDuplicate {
        eventId
        outcome
        changed
        duplicateResultingSceneId: resultingSceneId
        duplicateReason: reason
      }
      ... on PlayerEventIgnored {
        eventId
        ignoredReason: reason
      }
      ... on PlayerEventFailed {
        eventId
        actionId
        failedReason: reason
      }
      ... on PlayerEventAccepted {
        eventId
      }
      ... on PlayerEventRejected {
        eventId
        rejectedReason: reason
      }
    }
  }
`);

// The Player's session document (#42).
//
// The graph selection is `ShowGraphFields`, shared with the Show Editor
// (#742, ADR-0020). The Player used to spell out its own reduced graph
// selection, which is how it came to be missing Shape Field defaults, Scene
// Variable defaults, and every Transformer's transform — each invisible from
// this side alone.
//
// What is still Player-only is the session *around* the graph: which Device
// this is, its realtime grant, the Run's materialized values, the Flow
// bundle a per-connection Device navigates locally (ADR-0018), the active
// Scene and Canvas, and resolved image assets.
import { graphql } from "./graphql";
import { CanvasElementFields } from "./canvas";
import { ShowGraphFields } from "./show-graph-document";

/**
 * A Scene inside the Flow bundle a per-connection Device navigates locally.
 *
 * Selected apart from the graph because the bundle carries each Scene's
 * Canvas with it; the fields themselves match `ShowGraphFields`' Scene
 * Variables so both decode the same way.
 */
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
      defaultValue
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

export const GetPlayerSessionQuery = graphql(
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
          ...ShowGraphFields
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
          transformers {
            id
            name
            parentId
            color
            position {
              x
              y
            }
            ports {
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
            }
            transform {
              __typename
              kind
              ... on CalculateTransform {
                calculateFormula: formula
                outputType {
                  kind
                  shapeId
                  of {
                    kind
                    shapeId
                  }
                }
              }
              ... on FilterTransform {
                filterFormula: formula
              }
            }
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
  [ShowGraphFields, PlayerFlowSceneFields, CanvasElementFields],
);

export const SubmitPlayerEventMutation = graphql(`
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

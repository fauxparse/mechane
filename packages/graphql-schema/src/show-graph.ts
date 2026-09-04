// Typed Show-graph documents (issue #38), following the pattern in
// ./show.ts: the field set is spelled out per document rather than shared
// through a fragment, so callers get a plain object instead of a masked
// fragment to unwrap.
//
// `ShowGraph` and its parts are derived from the query's own result type,
// so they can't drift from what's actually selected — and, transitively,
// from apps/api's schema.
import { graphql } from "./graphql";
import type { ResultOf } from "gql.tada";
import { CanvasElementFields } from "./canvas";

export const GetShowGraphQuery = graphql(
  `
    query GetShowGraph($showId: ID!, $state: String) {
      showGraph(showId: $showId, state: $state) {
        showId
        state
        updatedAt
        version
        sourceFieldDefaults {
          nodeId
          fieldPath
          value
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
          stateSelectorVariableId
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
              defaultValue
              suggestedDimensions {
                width
                height
              }
            }
          }
          ... on FlowNode {
            defaultSceneId
            size
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
            fieldDefaults {
              fieldPath
              value
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
          layout
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
        shapes {
          id
          name
          fields {
            id
            name
            position
            required
            default {
              __typename
              ... on TextValue {
                textValue: value
              }
              ... on NumberValue {
                numberValue: value
              }
              ... on BooleanValue {
                booleanValue: value
              }
              ... on ImageValue {
                assetId
                url
                width
                height
                alt
                mimeType
                blurHash
              }
              ... on ColorValue {
                colorValue: value
              }
              ... on DateValue {
                dateValue: value
              }
              ... on DateTimeValue {
                datetimeValue: value
              }
              ... on ObjectValue {
                objectValue: value
              }
              ... on ArrayValue {
                arrayValue: value
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
      }
    }
  `,
  [CanvasElementFields],
);

/**
 * Applies a batch of edits to the draft graph (issue #103).
 *
 * `baseVersion` is what makes this safe to send fine-grained: it says which
 * graph the edits were composed against, so a batch that raced another
 * writer is refused rather than applied over the top. The response carries
 * the new `version`, which is what the next batch is composed against.
 *
 * Deliberately not the graph (#111): the editor composed these edits against
 * its own copy and already applied them. What it can't know is the version to
 * build on next, and anything the server decided for itself — which today is
 * only a new Device's pairing code, so those are the amendment fields
 * selected here. A wider amendment vocabulary (ADR-0003's realtime push)
 * would widen this selection.
 */
export const ApplyShowEditsMutation = graphql(`
  mutation ApplyShowEdits($showId: ID!, $baseVersion: Int!, $edits: [ShowEditInput!]!) {
    applyShowEdits(showId: $showId, baseVersion: $baseVersion, edits: $edits) {
      showId
      state
      updatedAt
      version
      amendments {
        type
        nodeId
        pairingCode
      }
    }
  }
`);

export const PublishShowGraphMutation = graphql(`
  mutation PublishShowGraph($showId: ID!) {
    publishShowGraph(showId: $showId) {
      showId
      state
      updatedAt
      version
      losses {
        sourceId
        fieldId
        fieldName
        path
        reason
      }
    }
  }
`);

export type ShowGraph = ResultOf<typeof GetShowGraphQuery>["showGraph"];
export type ApplyShowEditsResult = ResultOf<typeof ApplyShowEditsMutation>["applyShowEdits"];
export type ShowGraphNode = ShowGraph["nodes"][number];
export type ShowGraphEdge = ShowGraph["edges"][number];

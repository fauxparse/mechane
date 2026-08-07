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

export const GetShowGraphQuery = graphql(`
  query GetShowGraph($showId: ID!, $state: String) {
    showGraph(showId: $showId, state: $state) {
      showId
      state
      updatedAt
      version
      nodes {
        id
        kind
        name
        parentId
        defaultSceneId
        position {
          x
          y
        }
        variables {
          id
          name
        }
        perConnection
        pairingCode
      }
      edges {
        id
        kind
        sourceId
        targetId
        sourcePath
        targetPath
        targetVariableId
        cueId
        actionId
      }
    }
  }
`);

/**
 * Applies a batch of edits to the draft graph (issue #103).
 *
 * `baseVersion` is what makes this safe to send fine-grained: it says which
 * graph the edits were composed against, so a batch that raced another
 * writer is refused rather than applied over the top. The response carries
 * the new `version`, which is what the next batch is composed against.
 */
export const ApplyShowGraphEditsMutation = graphql(`
  mutation ApplyShowGraphEdits($showId: ID!, $baseVersion: Int!, $edits: [GraphEditInput!]!) {
    applyShowGraphEdits(showId: $showId, baseVersion: $baseVersion, edits: $edits) {
      showId
      state
      updatedAt
      version
      nodes {
        id
        kind
        name
        parentId
        defaultSceneId
        position {
          x
          y
        }
        variables {
          id
          name
        }
        perConnection
        pairingCode
      }
      edges {
        id
        kind
        sourceId
        targetId
        sourcePath
        targetPath
        targetVariableId
        cueId
        actionId
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
    }
  }
`);

export type ShowGraph = ResultOf<typeof GetShowGraphQuery>["showGraph"];
export type ShowGraphNode = ShowGraph["nodes"][number];
export type ShowGraphEdge = ShowGraph["edges"][number];

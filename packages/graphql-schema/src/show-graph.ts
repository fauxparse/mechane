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

export const SaveShowGraphMutation = graphql(`
  mutation SaveShowGraph($showId: ID!, $graph: ShowGraphInput!) {
    saveShowGraph(showId: $showId, graph: $graph) {
      showId
      state
      updatedAt
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
    }
  }
`);

export type ShowGraph = ResultOf<typeof GetShowGraphQuery>["showGraph"];
export type ShowGraphNode = ShowGraph["nodes"][number];
export type ShowGraphEdge = ShowGraph["edges"][number];

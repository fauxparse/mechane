// Typed Show-graph documents (issue #38).
//
// The graph selection is no longer spelled out here: it is `ShowGraphFields`
// in ./show-graph-document.ts, shared with the Player (#742, ADR-0020).
// Spelling it out per document is what let Studio and the Player select
// different fields and then disagree about what the wire means.
//
// What is still spelled out is the handful of fields only an editor can
// consume — persisted UI metadata, a Flow's authored size, and where an
// author dragged an edge's or an Action's route. They are selected inline
// rather than as a second fragment because gql.tada types two selections of
// the same field as an intersection of arrays, which nothing can be assigned
// to; inline keeps one flat result type for the query cache to work in.
import type { ResultOf } from "gql.tada";
import { graphql } from "./graphql";
import { ShowGraphFields } from "./show-graph-document";

export const GetShowGraphQuery = graphql(
  `
    query GetShowGraph($showId: ID!, $state: String) {
      showGraph(showId: $showId, state: $state) {
        ...ShowGraphFields
        nodes {
          editorMetadata
          ... on FlowNode {
            size
          }
        }
        edges {
          layout
        }
        actions {
          layout
        }
      }
    }
  `,
  [ShowGraphFields],
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

export type ApplyShowEditsResult = ResultOf<typeof ApplyShowEditsMutation>["applyShowEdits"];

import { graphql } from "./graphql";

export const GetActiveRunQuery = graphql(`
  query GetActiveRun($showId: ID!) {
    activeRun(showId: $showId) {
      id
      showId
      status
      startedAt
      endedAt
      stateSequence
      sourceValues
      structuredValues
    }
  }
`);

export const StartRunMutation = graphql(`
  mutation StartRun($showId: ID!) {
    startRun(showId: $showId) {
      id
      showId
      status
      startedAt
      endedAt
      stateSequence
      sourceValues
      structuredValues
    }
  }
`);

export const EndRunMutation = graphql(`
  mutation EndRun($showId: ID!) {
    endRun(showId: $showId) {
      id
      showId
      status
      startedAt
      endedAt
      stateSequence
      sourceValues
      structuredValues
    }
  }
`);

export const GetRunErrorsQuery = graphql(`
  query GetRunErrors($showId: ID!, $runId: ID, $category: String, $limit: Int) {
    runErrors(showId: $showId, runId: $runId, category: $category, limit: $limit) {
      id
      runId
      category
      message
      occurredAt
      deviceId
      sceneId
      elementId
      cueId
      actionId
      eventId
      publishedGraphVersion
    }
  }
`);

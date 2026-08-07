import { graphql } from "./graphql";

export const GetActiveRunQuery = graphql(`
  query GetActiveRun($showId: ID!) {
    activeRun(showId: $showId) {
      id
      showId
      status
      startedAt
      endedAt
      sourceValues
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
      sourceValues
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
      sourceValues
    }
  }
`);

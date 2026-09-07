// Which Shows are live, for every Show at once (issue #604).
//
// The dashboard needs this centrally rather than per card, because "a live
// Show takes the top spot" is a sort key: the order cannot be decided until
// every Show's Run state is known.
//
// The query keys are `../../api/runs`'s own, so a component that separately
// calls `useActiveRun` for one Show reads this cache instead of issuing a
// second request for an answer already on the page.
import type { ShowId } from "@mechane/domain";
import { GetActiveRunQuery, graphqlRequest } from "@mechane/graphql-schema";
import { useQueries } from "@tanstack/react-query";

import { GRAPHQL_ENDPOINT } from "../../api/client";
import { activeRunQueryKey } from "../../api/runs";

/** The parts of an active Run the dashboard displays. */
export interface LiveRun {
  readonly id: string;
  readonly status: string;
  readonly startedAt: string;
}

export interface ActiveRuns {
  /** Keyed by Show id. Absent means "not live", which is most of them. */
  readonly byShow: ReadonlyMap<string, LiveRun>;
  readonly pending: boolean;
}

export function useActiveRuns(showIds: readonly ShowId[]): ActiveRuns {
  return useQueries({
    queries: showIds.map((showId) => ({
      queryKey: activeRunQueryKey(showId),
      queryFn: async () => {
        const data = await graphqlRequest(GRAPHQL_ENDPOINT, GetActiveRunQuery, { showId });
        return data.activeRun;
      },
    })),
    combine: (results): ActiveRuns => {
      const byShow = new Map<string, LiveRun>();
      results.forEach((result, index) => {
        const showId = showIds[index];
        if (showId && result.data) byShow.set(showId, result.data);
      });
      return { byShow, pending: results.some((result) => result.isPending) };
    },
  });
}

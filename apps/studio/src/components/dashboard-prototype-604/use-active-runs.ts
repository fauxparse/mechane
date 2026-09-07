// PROTOTYPE — issue #604. Throwaway; see ./PrototypeSwitcher.tsx for the plan.
//
// Which Shows are live, for every Show at once.
//
// Round 2 needs this centrally, not per card: "a live Show takes the top spot"
// is a sort key, so it has to be known before anything is laid out. The query
// keys are `../../api/runs`'s own, so a card that also calls `useActiveRun`
// for its badge reads this cache rather than making a second request.
import type { ShowId } from "@mechane/domain";
import { GetActiveRunQuery, graphqlRequest } from "@mechane/graphql-schema";
import { useQueries } from "@tanstack/react-query";

import { GRAPHQL_ENDPOINT } from "../../api/client";
import { activeRunQueryKey } from "../../api/runs";

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

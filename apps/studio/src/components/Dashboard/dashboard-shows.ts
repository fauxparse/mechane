// How the dashboard orders and filters the Show list (issue #604).
//
// Pure, and separate from the components, because the ordering rule is the one
// piece of this screen with a right answer worth pinning down: a Show that is
// live outranks one that was merely edited recently, and getting that backwards
// puts the wrong Show in the one spot a director looks at first.
import type { ShowId } from "@mechane/domain";

/** The Show fields the dashboard list needs; a subset of the `shows` query. */
export interface DashboardShow {
  readonly id: ShowId;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Live first, then most recently updated.
 *
 * A director mid-performance is not looking for the thing they were fiddling
 * with this morning, so an active Run wins the top spot outright. Starting a
 * Run also touches `updatedAt`, which is why this cannot just be a recency
 * sort that happens to agree most of the time.
 */
export function byLiveThenRecency(liveShowIds: ReadonlySet<string>) {
  return (a: DashboardShow, b: DashboardShow): number => {
    const live = Number(liveShowIds.has(b.id)) - Number(liveShowIds.has(a.id));
    return live !== 0 ? live : Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  };
}

export interface ShowFilter {
  /** Free text matched against the Show name; blank matches everything. */
  readonly query: string;
  readonly liveOnly: boolean;
  readonly liveShowIds: ReadonlySet<string>;
}

/** Whether one Show survives the search box and the live toggle. */
export function matchesShowFilter(show: DashboardShow, filter: ShowFilter): boolean {
  const needle = filter.query.trim().toLocaleLowerCase();
  if (needle !== "" && !show.name.toLocaleLowerCase().includes(needle)) return false;
  return !filter.liveOnly || filter.liveShowIds.has(show.id);
}

/** True when a filter is narrowing the list, rather than showing all of it. */
export function isFiltering(filter: ShowFilter): boolean {
  return filter.query.trim() !== "" || filter.liveOnly;
}

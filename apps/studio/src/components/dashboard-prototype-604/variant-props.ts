// PROTOTYPE — issue #604. Throwaway; see ./PrototypeSwitcher.tsx for the plan.
//
// What the route hands every variant. Deliberately data and callbacks only:
// the variants disagree about layout, which is the point, so nothing here
// implies one.
import type { ShowId } from "@mechane/domain";

import type { DashboardHeaderUser } from "./DashboardHeader";

export interface DashboardShow {
  readonly id: ShowId;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DashboardVariantProps {
  readonly shows: readonly DashboardShow[];
  readonly pending: boolean;
  readonly loadError?: string;
  readonly user: DashboardHeaderUser;
  onLogOut(): void;
  onOpen(showId: ShowId): void;
  /** Straight to one Scene's Artboard in the Canvas editor. */
  onOpenScene(showId: ShowId, artId: string): void;
  /** Resolves by navigating into the new Show, so variants just fire and forget. */
  onCreate(name: string): void;
  readonly creating: boolean;
  readonly createError?: string;
  onDelete(showId: ShowId): void;
  readonly deletingId: ShowId | null;
}

/** Most recently touched first — every variant leads with recency. */
export function byRecency(a: DashboardShow, b: DashboardShow): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

/**
 * Round 2's ordering: "a show that is live takes precedence for the top spot
 * over one that is not live yet but was recently edited". Live first, then
 * recency — a director mid-performance is not looking for the thing they were
 * fiddling with this morning.
 */
export function byLiveThenRecency(liveShowIds: ReadonlySet<string>) {
  return (a: DashboardShow, b: DashboardShow): number => {
    const live = Number(liveShowIds.has(b.id)) - Number(liveShowIds.has(a.id));
    return live !== 0 ? live : Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  };
}

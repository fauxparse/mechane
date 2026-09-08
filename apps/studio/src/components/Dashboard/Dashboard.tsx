// The post-login home base (issue #604).
//
// Two halves, split by a full-bleed rule and a change of background: the Show
// you are about to work on above, the library you pick from below. The
// featured Show wears no card of its own — the division belongs to the page,
// not to the Show sitting in it.
//
// Presentational, like the rest of components/: the route wires the callbacks
// to navigation and to the create/delete mutations. The exceptions are the two
// reads that are per-Show rather than per-page — the active Runs and each
// Show's Scenes — which the components fetch themselves because the route
// cannot know how many Shows there will be. See ./use-show-dossier for what
// that costs.
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  SearchIcon,
  ToggleGroup,
  ToggleGroupItem,
  XIcon,
} from "@mechane/design-system";
import type { ShowId } from "@mechane/domain";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import type { DashboardShow } from "./dashboard-shows";
import { byLiveThenRecency, isFiltering, matchesShowFilter } from "./dashboard-shows";
import type { DashboardHeaderUser } from "./DashboardHeader";
import { DashboardHeader } from "./DashboardHeader";
import { NewShowCard } from "./NewShowCard";
import { NoShowsFound } from "./NoShowsFound";
import { ShowCard } from "./ShowCard";
import { SpotlightBand } from "./SpotlightBand";
import { useActiveRuns } from "./use-active-runs";

export interface DashboardProps {
  readonly shows: readonly DashboardShow[];
  readonly pending: boolean;
  readonly loadError?: string;
  readonly user: DashboardHeaderUser;
  onLogOut(): void;
  onOpenShow(showId: ShowId): void;
  /** Straight to one Scene's Artboard in the Canvas editor. */
  onOpenScene(showId: ShowId, artId: string): void;
  onCreateShow(name: string): void;
  readonly creating: boolean;
  readonly createError?: string;
  onDeleteShow(showId: ShowId): void;
  readonly deletingId: ShowId | null;
}

export function Dashboard({
  shows,
  pending,
  loadError,
  user,
  onLogOut,
  onOpenShow,
  onOpenScene,
  onCreateShow,
  creating,
  createError,
  onDeleteShow,
  deletingId,
}: DashboardProps) {
  const showIds = useMemo(() => shows.map((show) => show.id), [shows]);
  const runs = useActiveRuns(showIds);
  const [query, setQuery] = useState("");
  const [liveOnly, setLiveOnly] = useState(false);

  const liveShowIds = new Set(runs.byShow.keys());
  const filter = { query, liveOnly, liveShowIds };
  const ordered = [...shows].sort(byLiveThenRecency(liveShowIds));
  const featured = ordered[0] ?? null;
  const featuredRun = featured ? runs.byShow.get(featured.id) : undefined;
  const matching = ordered.filter((show) => matchesShowFilter(show, filter));
  const filtering = isFiltering(filter);
  const noMatches = matching.length === 0 && ordered.length > 0;

  // Filtering must not shrink the page: losing rows would shorten the
  // document, and a shortened document drags the scroll position with it. So
  // the list keeps a floor measured from its own unfiltered height — the one
  // number guaranteed to be tall enough, rather than a guess.
  const listRef = useRef<HTMLDivElement | null>(null);
  const [floor, setFloor] = useState(0);
  useLayoutEffect(() => {
    if (filtering) return;
    const node = listRef.current;
    if (node) setFloor(node.offsetHeight);
  }, [filtering, matching.length]);

  return (
    <div className="min-h-screen bg-sunken">
      {/*
        The top half: chrome and the featured Show. It sits on `bg-background`
        and is closed by a rule that runs the full width of the viewport rather
        than the content column; the library below sits on `bg-sunken`, one
        neutral step darker, so the two halves read as different places without
        a third surface lightness competing with the cards' `bg-card`.
      */}
      <div className="border-b border-border bg-background">
        <DashboardHeader user={user} onLogOut={onLogOut} />

        {loadError ? (
          <p role="alert" className="mx-auto w-full max-w-368 px-6 pb-6 text-destructive">
            Couldn't load Shows: {loadError}
          </p>
        ) : null}

        {featured ? (
          <div className="mx-auto w-full max-w-368 px-6">
            <SpotlightBand
              show={featured}
              live={featuredRun}
              onOpen={() => onOpenShow(featured.id)}
              onOpenScene={(artId) => onOpenScene(featured.id, artId)}
            />
          </div>
        ) : null}
      </div>

      <main className="mx-auto flex w-full max-w-368 flex-col gap-6 px-6 pb-16 pt-6 lg:pt-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-muted-foreground">
            {filtering ? `${matching.length} of ${ordered.length} shows` : "All shows"}
          </h2>
          {/* Beside the count rather than in place of the grid: the New Show
              card should not vanish and reflow while the list arrives. */}
          {pending ? <span className="text-sm text-muted-foreground">Loading Shows…</span> : null}

          {/* The controls belong with the thing they filter, not in the
              chrome: nothing above this line is theirs to change. */}
          <div className="ml-auto flex items-center gap-3">
            {/* Sized by a wrapper: InputGroup's own `w-full` is baked into its
                cva base, which a `className` cannot reliably outrank. */}
            <div className="w-60">
              <InputGroup className="rounded-full bg-muted/50 border-0">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Search shows"
                  placeholder="Search shows"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query ? (
                  <InputGroupAddon align="inline-end" className="size-8 p-1 mr-0!">
                    <InputGroupButton
                      className="rounded-full size-6"
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                    >
                      <XIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            </div>

            <ToggleGroup
              className="rounded-full bg-muted/50 h-8 p-0.5 gap-0 *:rounded-full *:h-7 *:px-3"
              value={[liveOnly ? "live" : "all"]}
              onValueChange={(value) => setLiveOnly(value[0] === "live")}
            >
              <ToggleGroupItem value="all" aria-label="Show all Shows">
                All
              </ToggleGroupItem>
              <ToggleGroupItem value="live" aria-label="Show only live Shows">
                Live only
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div ref={listRef} style={{ minHeight: floor > 0 ? floor : undefined }}>
          {noMatches ? (
            // Replaces the grid, New Show card included: a dashed "New Show"
            // rectangle alone in an empty grid says less than this does.
            <NoShowsFound
              query={query.trim()}
              onCreate={onCreateShow}
              creating={creating}
              error={createError}
            />
          ) : (
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
              {/* First cell, always: reachable without scrolling past every Show. */}
              <NewShowCard onCreate={onCreateShow} creating={creating} error={createError} />
              {matching.map((show) => (
                <ShowCard
                  key={show.id}
                  show={show}
                  live={runs.byShow.get(show.id)}
                  onOpen={() => onOpenShow(show.id)}
                  onDelete={() => onDeleteShow(show.id)}
                  deleting={deletingId === show.id}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

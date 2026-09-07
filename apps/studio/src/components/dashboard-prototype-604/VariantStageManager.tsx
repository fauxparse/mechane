// PROTOTYPE — issue #604, variant E. Throwaway; plan in ./PrototypeSwitcher.tsx.
//
// STAGE MANAGER — the argument against a permanent hero band.
//
// A band costs a third of the first screen whether or not the Show in it is
// the one you want, and it stops being the top spot at all once you have
// twenty Shows. So this variant has no band: the top spot is the first card in
// the grid, at double width, and everything else is a normal card in the same
// flow. Nothing is special-cased into its own region.
//
// The exception is a Show that is actually live, which gets a pinned strip
// above everything — a status bar, not a hero. It only exists while a Run is
// up, so the page has no permanently reserved furniture.
//
// Its answer on search: a sticky filter bar immediately above the grid, so the
// controls travel with the thing they filter and survive scrolling.
import {
  Button,
  cn,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  ImageOffIcon,
  RadioIcon,
  SearchIcon,
  ToggleGroup,
  ToggleGroupItem,
  TvMinimalIcon,
  XIcon,
} from "@mechane/design-system";
import { useMemo, useState } from "react";

import { DashboardHeader } from "./DashboardHeader";
import { LiveBadge } from "./LiveBadge";
import { NewShowCard } from "./NewShowCard";
import { relativeTime } from "./relative-time";
import { SceneStrip } from "./SceneStrip";
import { ShowCard } from "./ShowCard";
import { ShowPreview } from "./ShowPreview";
import { useActiveRuns } from "./use-active-runs";
import type { LiveRun } from "./use-active-runs";
import { useShowPreview } from "./use-show-preview";
import { byLiveThenRecency } from "./variant-props";
import type { DashboardShow, DashboardVariantProps } from "./variant-props";

type Sort = "recent" | "name";

export function VariantStageManager({
  shows,
  pending,
  loadError,
  user,
  onLogOut,
  onOpen,
  onOpenScene,
  onCreate,
  creating,
  createError,
  onDelete,
  deletingId,
}: DashboardVariantProps) {
  const showIds = useMemo(() => shows.map((show) => show.id), [shows]);
  const runs = useActiveRuns(showIds);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [liveOnly, setLiveOnly] = useState(false);

  const liveIds = new Set(runs.byShow.keys());
  const needle = query.trim().toLocaleLowerCase();
  const matches = (show: DashboardShow) =>
    (needle === "" || show.name.toLocaleLowerCase().includes(needle)) &&
    (!liveOnly || liveIds.has(show.id));

  // Recency owns the top spot; the sort control only reorders the grid. Two
  // lists rather than one, because "the thing I was last working on" must not
  // become "the thing that sorts first alphabetically" when the grid is
  // resorted — the resume card would silently change identity.
  const byRecent = [...shows].sort(byLiveThenRecency(liveIds)).filter(matches);
  const onAir = byRecent.find((show) => liveIds.has(show.id)) ?? null;
  // The strip is status, not a place a Show lives: the grid still lists every
  // Show, live one included, so "Live only" can never filter down to nothing.
  // The resume card is therefore the most recent Show that is *not* on air —
  // what you were editing is not what is currently in front of an audience.
  const resume = byRecent.find((show) => show.id !== onAir?.id) ?? null;
  const grid =
    sort === "name" ? [...byRecent].sort((a, b) => a.name.localeCompare(b.name)) : byRecent;
  const rest = grid.filter((show) => show.id !== resume?.id);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader user={user} onLogOut={onLogOut} />

      {onAir ? (
        <LiveStrip
          show={onAir}
          live={runs.byShow.get(onAir.id) as LiveRun}
          onOpen={() => onOpen(onAir.id)}
          onOpenScene={(artId) => onOpenScene(onAir.id, artId)}
        />
      ) : null}

      <main className="mx-auto w-full max-w-[92rem] px-6 pb-28">
        {loadError ? (
          <p role="alert" className="py-4 text-destructive">
            Couldn't load Shows: {loadError}
          </p>
        ) : null}

        {/* Sticky: the controls stay with the grid instead of scrolling off. */}
        <div className="sticky top-0 z-20 -mx-2 flex flex-wrap items-center gap-3 bg-background/85 px-2 py-3 backdrop-blur">
          <h1 className="text-lg font-semibold tracking-tight">Shows</h1>
          {/* Sized by a wrapper: InputGroup's own `w-full` is baked into its
              cva base, which a `className` cannot reliably outrank. */}
          <div className="w-56">
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Filter Shows"
                placeholder="Filter by name"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton aria-label="Clear filter" onClick={() => setQuery("")}>
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </div>

          <ToggleGroup
            value={[sort]}
            onValueChange={(value) => setSort((value[0] as Sort) ?? "recent")}
          >
            <ToggleGroupItem value="recent">Recent</ToggleGroupItem>
            <ToggleGroupItem value="name">A–Z</ToggleGroupItem>
          </ToggleGroup>

          <Button
            variant={liveOnly ? "primary" : "outline"}
            size="sm"
            aria-pressed={liveOnly}
            onClick={() => setLiveOnly((value) => !value)}
          >
            <RadioIcon />
            Live only
            {runs.byShow.size > 0 ? (
              <span className="tabular-nums opacity-70">{runs.byShow.size}</span>
            ) : null}
          </Button>

          <span className="ml-auto text-sm text-muted-foreground tabular-nums">
            {byRecent.length} of {shows.length}
          </span>
        </div>

        <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))]">
          <NewShowCard onCreate={onCreate} creating={creating} error={createError} />

          {resume ? (
            <ResumeCard
              show={resume}
              onOpen={() => onOpen(resume.id)}
              onOpenScene={(artId) => onOpenScene(resume.id, artId)}
            />
          ) : null}

          {rest.map((show) => (
            <ShowCard
              key={show.id}
              show={show}
              live={runs.byShow.get(show.id)}
              onOpen={() => onOpen(show.id)}
              onOpenScene={(artId) => onOpenScene(show.id, artId)}
              onDelete={() => onDelete(show.id)}
              deleting={deletingId === show.id}
            />
          ))}
        </div>

        {!pending && byRecent.length === 0 && shows.length > 0 ? (
          <p className="pt-4 text-sm text-muted-foreground">
            Nothing matches {query ? `“${query}”` : "that filter"}.
          </p>
        ) : null}
      </main>
    </div>
  );
}

interface LiveStripProps {
  show: DashboardShow;
  live: LiveRun;
  onOpen(): void;
  onOpenScene(artId: string): void;
}

/** Present only while a Run is up, which is what makes it read as status. */
function LiveStrip({ show, live, onOpen, onOpenScene }: LiveStripProps) {
  const preview = useShowPreview(show.id);

  return (
    <section
      aria-label="Live now"
      className="flex flex-wrap items-center gap-4 border-y border-live bg-live/10 px-6 py-3"
    >
      <ShowPreview
        scene={preview.hero}
        fit="cover"
        className="h-14 w-24 rounded ring-1 ring-live/40"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <LiveBadge startedAt={live.startedAt} />
          <h2 className="truncate text-base font-semibold">{show.name}</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Run {live.id.slice(-6)} · {live.status}
        </p>
      </div>
      <SceneStrip scenes={preview.scenes} onOpenScene={onOpenScene} className="hidden lg:flex" />
      <Button className="ml-auto" onClick={onOpen}>
        <TvMinimalIcon />
        Take control
      </Button>
    </section>
  );
}

interface ResumeCardProps {
  show: DashboardShow;
  onOpen(): void;
  onOpenScene(artId: string): void;
}

/**
 * The top spot as a grid cell rather than a page region: double width where
 * there is room, one column where there is not, and gone entirely the moment
 * a filter excludes it.
 */
function ResumeCard({ show, onOpen, onOpenScene }: ResumeCardProps) {
  const preview = useShowPreview(show.id);

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-xl bg-muted/40 p-5 ring-1 ring-border",
        "sm:col-span-2",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pick up where you left off
          </p>
          <h2 className="pt-1 text-2xl font-semibold tracking-tight">{show.name}</h2>
          <p className="text-sm text-muted-foreground">
            Updated {relativeTime(show.updatedAt)}
            {preview.pending
              ? ""
              : ` · ${preview.counts.scenes} Scenes · ${preview.counts.devices} Devices`}
          </p>
        </div>
        <Button onClick={onOpen}>
          <TvMinimalIcon />
          Open
        </Button>
      </div>

      <div className="flex h-56 items-center justify-center">
        <ShowPreview
          scene={preview.hero}
          shape="scene"
          className="h-full rounded-lg ring-1 ring-border"
          fallback={
            preview.pending ? null : (
              <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <ImageOffIcon className="size-6" />
                No Scenes yet
              </span>
            )
          }
        />
      </div>

      <SceneStrip scenes={preview.scenes} onOpenScene={onOpenScene} slots={6} />
    </article>
  );
}

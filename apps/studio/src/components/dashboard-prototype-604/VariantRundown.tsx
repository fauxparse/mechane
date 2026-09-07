// PROTOTYPE — issue #604, variant F. Throwaway; plan in ./PrototypeSwitcher.tsx.
//
// RUNDOWN — the argument that the thing you are navigating to is usually a
// Scene, not a Show.
//
// So the band's right half is not a caption with thumbnails tacked on: it is a
// rundown, one row per Scene, each row a labelled link into that Scene's
// Artboard. And every card carries its own Scene strip, so the whole page is a
// Scene launcher rather than a Show launcher with a shortcut on the hero.
//
// Its answer on search: not a control at all. A ⌘K palette over Shows *and*
// Scenes, so one search reaches both, and the grid underneath never reshuffles
// or empties out while you type. Filtering a page you are looking at and
// searching for a thing you cannot see are different jobs.
import {
  ArrowRightIcon,
  Button,
  cn,
  CommandIcon,
  Dialog,
  DialogContent,
  DialogTitle,
  ImageOffIcon,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  SearchIcon,
  TvMinimalIcon,
} from "@mechane/design-system";
import type { ShowId } from "@mechane/domain";
import { useEffect, useMemo, useState } from "react";

import { DashboardHeader } from "./DashboardHeader";
import { LiveBadge, LiveDot } from "./LiveBadge";
import { NewShowCard } from "./NewShowCard";
import { relativeTime } from "./relative-time";
import { ShowCard } from "./ShowCard";
import { ShowPreview } from "./ShowPreview";
import { useActiveRuns } from "./use-active-runs";
import type { LiveRun } from "./use-active-runs";
import { useShowPreview } from "./use-show-preview";
import type { ScenePreview } from "./use-show-preview";
import { byLiveThenRecency } from "./variant-props";
import type { DashboardShow, DashboardVariantProps } from "./variant-props";

export function VariantRundown({
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
  const [searching, setSearching] = useState(false);

  const ordered = [...shows].sort(byLiveThenRecency(new Set(runs.byShow.keys())));
  const featured = ordered[0] ?? null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setSearching(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        user={user}
        onLogOut={onLogOut}
        actions={
          <>
            {runs.byShow.size > 0 ? <LiveBadge className="mr-1" /> : null}
            <Button variant="outline" size="sm" onClick={() => setSearching(true)}>
              <SearchIcon />
              Search
              <kbd className="ml-1 flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[0.7rem] text-muted-foreground">
                <CommandIcon className="size-3" />K
              </kbd>
            </Button>
          </>
        }
      />

      <main className="mx-auto flex w-full max-w-[92rem] flex-col gap-8 px-6 pb-28 pt-2">
        {loadError ? (
          <p role="alert" className="text-destructive">
            Couldn't load Shows: {loadError}
          </p>
        ) : null}

        {featured ? (
          <RundownBand
            show={featured}
            live={runs.byShow.get(featured.id)}
            onOpen={() => onOpen(featured.id)}
            onOpenScene={(artId) => onOpenScene(featured.id, artId)}
          />
        ) : null}

        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          All Shows
        </h2>

        <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))]">
          <NewShowCard onCreate={onCreate} creating={creating} error={createError} />
          {ordered.map((show) => (
            <ShowCard
              key={show.id}
              show={show}
              live={runs.byShow.get(show.id)}
              onOpen={() => onOpen(show.id)}
              onOpenScene={(artId) => onOpenScene(show.id, artId)}
              onDelete={() => onDelete(show.id)}
              deleting={deletingId === show.id}
              showScenes
            />
          ))}
        </div>

        {pending ? <p className="text-sm text-muted-foreground">Loading Shows…</p> : null}
      </main>

      <SearchPalette
        open={searching}
        onOpenChange={setSearching}
        shows={ordered}
        liveIds={new Set(runs.byShow.keys())}
        onOpen={onOpen}
        onOpenScene={onOpenScene}
      />
    </div>
  );
}

interface RundownBandProps {
  show: DashboardShow;
  live?: LiveRun;
  onOpen(): void;
  onOpenScene(artId: string): void;
}

function RundownBand({ show, live, onOpen, onOpenScene }: RundownBandProps) {
  const preview = useShowPreview(show.id);

  return (
    <section
      className={cn(
        "grid overflow-hidden rounded-xl bg-muted/40 ring-1 ring-border lg:grid-cols-[1.4fr_1fr]",
        live && "ring-2 ring-live",
      )}
    >
      <div className="flex h-[40vh] min-h-64 items-center justify-center border-b border-border p-4 lg:border-b-0 lg:border-r">
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

      <div className="flex min-h-0 flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {live ? "On stage now" : "Pick up where you left off"}
          </p>
          {live ? <LiveBadge startedAt={live.startedAt} /> : null}
        </div>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{show.name}</h1>
            <p className="text-sm text-muted-foreground">
              Updated {relativeTime(show.updatedAt)}
              {preview.pending ? "" : ` · ${preview.counts.devices} Devices`}
            </p>
          </div>
          <Button onClick={onOpen}>
            <TvMinimalIcon />
            Open
          </Button>
        </div>

        {/* The rundown: named rows, not a thumbnail strip. Each one is the
            fastest path to the Scene a director actually wants to change. */}
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-lg bg-background/60 ring-1 ring-border">
          {preview.scenes.map((scene) => (
            <li key={scene.artId} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => onOpenScene(scene.artId)}
                className="group flex w-full cursor-pointer items-center gap-3 px-2 py-1.5 text-left hover:bg-muted"
              >
                <ShowPreview
                  scene={scene}
                  fit="cover"
                  className="h-8 w-12 shrink-0 rounded-sm ring-1 ring-border"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{scene.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {scene.width} × {scene.height}
                </span>
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </button>
            </li>
          ))}
          {preview.scenes.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {preview.pending ? "Loading Scenes…" : "No Scenes yet"}
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}

interface SearchPaletteProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  shows: readonly DashboardShow[];
  liveIds: ReadonlySet<string>;
  onOpen(showId: ShowId): void;
  onOpenScene(showId: ShowId, artId: string): void;
}

/**
 * Search that reaches Scenes. The Scene names come from the same per-Show
 * preview reads the cards already made, so opening the palette costs nothing
 * it has not already paid for.
 */
function SearchPalette({
  open,
  onOpenChange,
  shows,
  liveIds,
  onOpen,
  onOpenScene,
}: SearchPaletteProps) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="w-[32rem] max-w-[92vw]">
        <DialogTitle className="sr-only">Search Shows and Scenes</DialogTitle>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            autoFocus
            aria-label="Search Shows and Scenes"
            placeholder="Search Shows and Scenes…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>

        <ul className="max-h-80 overflow-y-auto pt-2">
          {shows.map((show) => (
            <PaletteGroup
              key={show.id}
              show={show}
              live={liveIds.has(show.id)}
              needle={needle}
              onOpen={() => {
                onOpenChange(false);
                onOpen(show.id);
              }}
              onOpenScene={(artId) => {
                onOpenChange(false);
                onOpenScene(show.id, artId);
              }}
            />
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

interface PaletteGroupProps {
  show: DashboardShow;
  live: boolean;
  needle: string;
  onOpen(): void;
  onOpenScene(artId: string): void;
}

function PaletteGroup({ show, live, needle, onOpen, onOpenScene }: PaletteGroupProps) {
  const preview = useShowPreview(show.id);
  const nameMatches = needle === "" || show.name.toLocaleLowerCase().includes(needle);
  const scenes: readonly ScenePreview[] =
    needle === ""
      ? []
      : preview.scenes.filter((scene) => scene.name.toLocaleLowerCase().includes(needle));

  if (!nameMatches && scenes.length === 0) return null;

  return (
    <li className="pb-1">
      {nameMatches ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
        >
          <TvMinimalIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{show.name}</span>
          {live ? <LiveDot /> : null}
          <span className="shrink-0 text-xs text-muted-foreground">
            {preview.counts.scenes} Scenes
          </span>
        </button>
      ) : null}
      {scenes.map((scene) => (
        <button
          key={scene.artId}
          type="button"
          onClick={() => onOpenScene(scene.artId)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md py-1.5 pl-8 pr-2 text-left hover:bg-muted"
        >
          <ShowPreview
            scene={scene}
            fit="cover"
            className="h-6 w-9 shrink-0 rounded-sm ring-1 ring-border"
          />
          <span className="min-w-0 flex-1 truncate text-sm">{scene.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">in {show.name}</span>
        </button>
      ))}
    </li>
  );
}

// PROTOTYPE — issue #604, variant D. Throwaway; plan in ./PrototypeSwitcher.tsx.
//
// SPOTLIGHT — variant C's band over variant A's cards, and the direction round
// 2 picked.
//
// The page is two halves, split by a full-bleed rule and a change of
// background: the Show you are about to work on above, the library you pick
// from below. The featured Show wears no card of its own — the division
// belongs to the page, not to the Show sitting in it.
//
// "Live" is a change of subject rather than a decoration, so a Run turns the
// whole top half and the band stops saying "pick up where you left off" and
// starts saying "on stage now".
//
// The grid below is a flat set of equal cards with the New Show card first,
// and its search and filter sit with it rather than up in the chrome: nothing
// above that line is theirs to change.
import {
  Button,
  buttonVariants,
  cn,
  ExternalLinkIcon,
  ImageOffIcon,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  PencilIcon,
  SearchIcon,
  ToggleGroup,
  ToggleGroupItem,
  XIcon,
} from "@mechane/design-system";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { playerSessionUrl } from "../../api/client";
// The Show graph's own icon table, so a Device's link wears the same icon as
// the Device node does in the editor: Smartphone for an Audience Device,
// Projector for a shared one. Reusing it means they cannot drift apart.
import { nodeIcon } from "../../editors/show/graph/node-kinds";
import { DashboardHeader } from "./DashboardHeader";
import { LiveBadge } from "./LiveBadge";
import { NewShowCard } from "./NewShowCard";
import { NoShowsFound } from "./NoShowsFound";
import { relativeTime } from "./relative-time";
import { SceneStrip } from "./SceneStrip";
import { ShowCard } from "./ShowCard";
import { ShowCounts } from "./ShowCounts";
import { ShowPreview } from "./ShowPreview";
import { useActiveRuns } from "./use-active-runs";
import type { LiveRun } from "./use-active-runs";
import { useShowPreview } from "./use-show-preview";
import type { DevicePreview } from "./use-show-preview";
import { byLiveThenRecency } from "./variant-props";
import type { DashboardShow, DashboardVariantProps } from "./variant-props";

type Scope = "all" | "live";

export function VariantSpotlight({
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
  const [scope, setScope] = useState<Scope>("all");

  const ordered = [...shows].sort(byLiveThenRecency(new Set(runs.byShow.keys())));
  const featured = ordered[0] ?? null;
  const featuredRun = featured ? runs.byShow.get(featured.id) : undefined;
  const needle = query.trim().toLocaleLowerCase();
  const filtering = needle !== "" || scope !== "all";
  const matching = ordered.filter(
    (show) =>
      (needle === "" || show.name.toLocaleLowerCase().includes(needle)) &&
      (scope === "all" || runs.byShow.has(show.id)),
  );
  const noMatches = matching.length === 0 && ordered.length > 0;

  // Filtering must not shrink the page: losing rows would shorten the
  // document, and a shortened document drags the scroll position with it. So
  // the list keeps a floor measured from its own unfiltered height — the one
  // number that is guaranteed to be tall enough, rather than a guess.
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
        The top half: chrome and the Show you are most likely here for. It sits
        on `bg-background` and is closed by a rule that runs the full width of
        the viewport rather than the content column; the library below sits on
        `bg-sunken`, one neutral step darker, so the two halves read as
        different places without a third surface lightness competing with the
        cards' `bg-card`.
      */}
      <div className="border-b border-border bg-background">
        <DashboardHeader user={user} onLogOut={onLogOut} />

        {loadError ? (
          <p role="alert" className="mx-auto w-full max-w-[92rem] px-6 pb-6 text-destructive">
            Couldn't load Shows: {loadError}
          </p>
        ) : null}

        {featured ? (
          <div className="mx-auto w-full max-w-[92rem] px-6 pb-8">
            <SpotlightBand
              show={featured}
              live={featuredRun}
              onOpen={() => onOpen(featured.id)}
              onOpenScene={(artId) => onOpenScene(featured.id, artId)}
            />
          </div>
        ) : null}
      </div>

      <main className="mx-auto flex w-full max-w-[92rem] flex-col gap-6 px-6 pb-28 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {needle === "" && scope === "all"
              ? "All Shows"
              : `${matching.length} of ${ordered.length} Shows`}
          </h2>
          {/* Beside the count rather than in place of the grid: the New Show
              card should not vanish and reflow while the list arrives. */}
          {pending ? <span className="text-sm text-muted-foreground">Loading Shows…</span> : null}

          <div className="ml-auto flex items-center gap-3">
            {/* Sized by a wrapper: InputGroup's own `w-full` is baked into its
                cva base, which a `className` cannot reliably outrank. */}
            <div className="w-60">
              <InputGroup>
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Search Shows"
                  placeholder="Search Shows"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query ? (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton aria-label="Clear search" onClick={() => setQuery("")}>
                      <XIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            </div>

            <ToggleGroup
              value={[scope]}
              onValueChange={(value) => setScope((value[0] as Scope) ?? "all")}
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
              onCreate={onCreate}
              creating={creating}
              error={createError}
            />
          ) : (
            // Narrower columns now the caption is one line and a row of icons
            // rather than two lines of prose: more Shows per row at the same
            // preview quality, which is the point of shrinking the card.
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
              {/* First cell, always: reachable without scrolling past every Show. */}
              <NewShowCard onCreate={onCreate} creating={creating} error={createError} />
              {matching.map((show) => (
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
          )}
        </div>
      </main>
    </div>
  );
}

interface SpotlightBandProps {
  show: DashboardShow;
  live?: LiveRun;
  onOpen(): void;
  onOpenScene(artId: string): void;
}

function SpotlightBand({ show, live, onOpen, onOpenScene }: SpotlightBandProps) {
  const preview = useShowPreview(show.id);

  return (
    // Two columns only once the second one can actually hold a Show name, a
    // Scene strip and the Device links: `md` (768px) split a ~780px viewport
    // into a starved 330px column where every line wrapped and the strip
    // stacked one thumbnail per row. `lg` plus a `minmax(20rem, …)` floor
    // makes the side column earn its place, and below that the band is simply
    // one column: preview, then everything else.
    <section className="grid items-stretch gap-5 pt-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,1fr)] lg:gap-8">
      {/*
        A fixed-height row with a Scene-shaped box inside, so a 16:9 projector
        Scene and a 9:16 phone Scene both fill the height and neither gets grey
        bars pretending to be part of the design. Shorter when stacked, where
        the column below it needs the vertical room more than the picture does.
      */}
      <div className="flex h-[30vh] min-h-48 items-center justify-center lg:h-[38vh] lg:min-h-64">
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

      {/* `min-w-0` so the truncating Show name cannot widen the grid column. */}
      <div className="flex min-w-0 flex-col gap-4 lg:py-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {live ? "On stage now" : "Pick up where you left off"}
          </p>
          {live ? <LiveBadge startedAt={live.startedAt} /> : null}
        </div>

        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight xl:text-3xl">
            {show.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 text-sm">
            <ShowCounts counts={preview.counts} pending={preview.pending} size="md" />
            <span className="text-muted-foreground">Updated {relativeTime(show.updatedAt)}</span>
          </div>
        </div>

        <SceneStrip scenes={preview.scenes} onOpenScene={onOpenScene} size="md" />

        <div className="mt-auto flex flex-col gap-3">
          {/*
            The primary action goes where the Show is authored, so it says so.
            The Player is a different destination entirely — it is what an
            audience or a projector sees — so its Devices are secondary links,
            one per Device, rather than one ambiguous "open".
          */}
          <Button size="lg" className="self-start" onClick={onOpen}>
            <PencilIcon />
            Edit Show
          </Button>
          <DeviceLinks devices={preview.devices} />
        </div>
      </div>
    </section>
  );
}

function DeviceLinks({ devices }: { devices: readonly DevicePreview[] }) {
  if (devices.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Open in Player
      </p>
      <ul className="flex flex-wrap gap-2">
        {devices.map((device) => {
          const Icon = nodeIcon("device", { perConnection: device.perConnection });
          // The Show Editor's own wording for the two kinds, so the link and
          // the Device inspector describe the same thing the same way.
          const description = device.perConnection
            ? "Every device joins independently. Good for audience phones."
            : "Everything that joins sees the same thing. Good for projectors and laptops.";
          return (
            <li key={device.id}>
              {device.pairingCode ? (
                <a
                  // New tab because the Player is where the performance is:
                  // you are putting it on another screen, not leaving Studio.
                  href={playerSessionUrl(device.pairingCode)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  title={description}
                >
                  <Icon />
                  {device.name}
                  <ExternalLinkIcon className="text-muted-foreground" />
                </a>
              ) : (
                // A Device the server has never seen has no code to join with.
                <span
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "pointer-events-none opacity-50",
                  )}
                  title={description}
                >
                  <Icon />
                  {device.name}
                  <span className="text-xs text-muted-foreground">not paired yet</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// The Show you are most likely here for (issue #604).
//
// One Show, large: its biggest Scene, its contents as counts, a jump into any
// of its Scenes, the way into the editor, and the way onto each of its
// Devices. When a Run is up it changes subject rather than growing a badge —
// "on stage now" instead of "pick up where you left off".
import { Button, ImageOffIcon, PencilIcon } from "@mechane/design-system";

import type { DashboardShow } from "./dashboard-shows";
import { DeviceLinks } from "./DeviceLinks";
import { relativeTime } from "./elapsed";
import { LiveBadge } from "./LiveBadge";
import { SceneStrip } from "./SceneStrip";
import { ShowCounts } from "./ShowCounts";
import { ShowPreview } from "./ShowPreview";
import type { LiveRun } from "./use-active-runs";
import { useShowDossier } from "./use-show-dossier";

export interface SpotlightBandProps {
  show: DashboardShow;
  live?: LiveRun;
  onOpen(): void;
  onOpenScene(artId: string): void;
}

export function SpotlightBand({ show, live, onOpen, onOpenScene }: SpotlightBandProps) {
  const dossier = useShowDossier(show.id);

  return (
    // Two columns only once the second one can hold a Show name, a Scene strip
    // and the Device links. At `md` a ~780px viewport left a starved 330px
    // column where every line wrapped and the strip stacked one thumbnail per
    // row; `lg` plus a `minmax(20rem, …)` floor makes the side column earn its
    // place, and below that the band is one column.
    <section className="grid items-stretch gap-5 pt-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,1fr)] lg:gap-8">
      {/*
        A fixed-height row with a Scene-shaped box inside, so a 16:9 projector
        Scene and a 9:16 phone Scene both fill the height and neither gets grey
        bars pretending to be part of the design. Shorter when stacked, where
        the column below it needs the vertical room more than the picture does.
      */}
      <div className="flex h-[30vh] min-h-48 items-center justify-center lg:h-[38vh] lg:min-h-64">
        <ShowPreview
          scene={dossier.hero}
          shape="scene"
          className="h-full rounded-lg ring-1 ring-border"
          fallback={
            dossier.pending ? null : (
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
            <ShowCounts counts={dossier.counts} pending={dossier.pending} size="md" />
            <span className="text-muted-foreground">Updated {relativeTime(show.updatedAt)}</span>
          </div>
        </div>

        <SceneStrip scenes={dossier.scenes} onOpenScene={onOpenScene} size="md" />

        <div className="mt-auto flex flex-col gap-3">
          {/* The primary action goes where the Show is authored, so it says so. */}
          <Button size="lg" className="self-start" onClick={onOpen}>
            <PencilIcon />
            Edit Show
          </Button>
          <DeviceLinks devices={dossier.devices} />
        </div>
      </div>
    </section>
  );
}

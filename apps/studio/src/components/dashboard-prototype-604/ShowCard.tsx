// PROTOTYPE — issue #604. Throwaway; see ./PrototypeSwitcher.tsx for the plan.
//
// The card from variant A, now shared: round 2 settled on "C as a starting
// point, with the table replaced with the cards from A", so the card is part
// of the agreed base rather than one variant's idea.
//
// Deliberately small. The preview is the thing worth looking at, so the
// caption underneath is one line of name and one row of icon counts — no
// prose, no wrapped "4 Scenes · 2 Devices · updated 3 minutes ago" pushing the
// grid to two-across on a laptop. Whether a card is also a Scene launcher is
// still an open question, so it is a prop the variants disagree about rather
// than a decision baked in here.
import {
  Button,
  Card,
  CardAction,
  CardHeader,
  CardTitle,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EllipsisIcon,
  ImageOffIcon,
  Trash2Icon,
  TvMinimalIcon,
} from "@mechane/design-system";
import { useState } from "react";

import { DeleteShowDialog } from "./DeleteShowDialog";
import { LiveBadge } from "./LiveBadge";
import { relativeTime } from "./relative-time";
import { SceneStrip } from "./SceneStrip";
import { ShowCounts } from "./ShowCounts";
import { ShowPreview } from "./ShowPreview";
import { useShowPreview } from "./use-show-preview";
import type { LiveRun } from "./use-active-runs";
import type { DashboardShow } from "./variant-props";

export interface ShowCardProps {
  show: DashboardShow;
  live?: LiveRun;
  onOpen(): void;
  onOpenScene(artId: string): void;
  onDelete(): void;
  deleting: boolean;
  /** Turns the card into a Scene launcher as well as a Show launcher. */
  showScenes?: boolean;
  className?: string;
}

export function ShowCard({
  show,
  live,
  onOpen,
  onOpenScene,
  onDelete,
  deleting,
  showScenes = false,
  className,
}: ShowCardProps) {
  const preview = useShowPreview(show.id);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Card
        size="sm"
        className={cn(
          "gap-0 pt-0 transition-shadow hover:shadow-lg hover:ring-foreground/20",
          // A live Show is ringed rather than tinted: the card body is the
          // Show's own art, and tinting it would misreport the design.
          live && "ring-2 ring-live hover:ring-live",
          className,
        )}
      >
        <div className="relative">
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${show.name}`}
            className="block w-full cursor-pointer rounded-t-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ShowPreview
              scene={preview.hero}
              className="aspect-[16/10] rounded-t-xl border-b border-border"
              fallback={
                preview.pending ? null : (
                  <span className="flex flex-col items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                    <ImageOffIcon className="size-4" />
                    No Scenes yet
                  </span>
                )
              }
            />
          </button>
          {live ? (
            <LiveBadge startedAt={live.startedAt} className="absolute left-1.5 top-1.5" />
          ) : null}
        </div>

        <CardHeader className="gap-1.5 pt-2.5">
          <CardTitle className="truncate text-sm">{show.name}</CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <ShowCounts counts={preview.counts} pending={preview.pending} />
            <span className="truncate text-muted-foreground">{relativeTime(show.updatedAt)}</span>
          </div>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-xs" aria-label={`${show.name} options`}>
                    <EllipsisIcon />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onOpen}>
                  <TvMinimalIcon />
                  Open
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
                  <Trash2Icon />
                  Delete Show…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        </CardHeader>

        {showScenes && preview.scenes.length > 0 ? (
          <SceneStrip
            scenes={preview.scenes}
            onOpenScene={onOpenScene}
            className="px-(--card-spacing) pt-2.5"
          />
        ) : null}
      </Card>

      <DeleteShowDialog
        name={show.name}
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={onDelete}
        deleting={deleting}
        blastRadius={`${preview.counts.scenes} Scenes and ${preview.counts.devices} Devices`}
      />
    </>
  );
}

// One Show in the grid (issue #604).
//
// Deliberately small. The preview is the thing worth looking at, so the caption
// underneath is one line of name and one row of icon counts — no prose, and
// nothing that wraps and pushes the grid to two-across on a laptop.
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

import type { DashboardShow } from "./dashboard-shows";
import { DeleteShowDialog } from "./DeleteShowDialog";
import { relativeTime } from "./elapsed";
import { LiveBadge } from "./LiveBadge";
import { ShowCounts } from "./ShowCounts";
import { ShowPreview } from "./ShowPreview";
import type { LiveRun } from "./use-active-runs";
import { useShowDossier } from "./use-show-dossier";

export interface ShowCardProps {
  show: DashboardShow;
  live?: LiveRun;
  onOpen(): void;
  onDelete(): void;
  deleting: boolean;
  className?: string;
}

export function ShowCard({ show, live, onOpen, onDelete, deleting, className }: ShowCardProps) {
  const dossier = useShowDossier(show.id);
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
            className="block p-2 w-full cursor-pointer rounded-t-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ShowPreview
              scene={dossier.hero}
              className="aspect-16/10 rounded-sm border-b border-border"
              fallback={
                dossier.pending ? null : (
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
          <div className="flex flex-col gap-2 items-start text-xs">
            <ShowCounts counts={dossier.counts} pending={dossier.pending} />
            <div className="truncate text-muted-foreground">{relativeTime(show.updatedAt)}</div>
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
      </Card>

      <DeleteShowDialog
        name={show.name}
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={onDelete}
        deleting={deleting}
        blastRadius={`${dossier.counts.scenes} Scenes and ${dossier.counts.devices} Devices`}
      />
    </>
  );
}

// PROTOTYPE — issue #604, variant B. Throwaway; plan in ./PrototypeSwitcher.tsx.
//
// WORKBENCH. The argument against a grid: once you have more than a screenful
// of Shows, a grid makes you scroll to compare and gives every Show the same
// weight. So this one is two panes — a dense rail of every Show on the left,
// and one Show inspected in full on the right: its biggest Scene large, every
// Scene beneath it, and the graph's actual contents as facts. Deciding and
// acting happen in different places, which is what makes the destructive
// action safe to keep in the open.
//
// #604's four points land as: preview in the rail thumbnails and the detail
// pane, the shared chrome header, "New Show" behind a dialog off the rail
// header, and Delete in the detail pane's action row behind a type-the-name
// confirmation.
import {
  Button,
  cn,
  ImageOffIcon,
  PlusIcon,
  Trash2Icon,
  TvMinimalIcon,
} from "@mechane/design-system";
import type { ShowId } from "@mechane/domain";
import { useState } from "react";

import { DashboardHeader } from "./DashboardHeader";
import { DeleteShowDialog } from "./DeleteShowDialog";
// Round 2 settled on variant D, so this one is frozen reference code: it
// points at the shared dialog only so the file still compiles.
import { NewShowDialog } from "./NewShowDialog";
import { relativeTime } from "./relative-time";
import { ShowPreview } from "./ShowPreview";
import { useShowPreview } from "./use-show-preview";
import { byRecency } from "./variant-props";
import type { DashboardShow, DashboardVariantProps } from "./variant-props";

export function VariantWorkbench({
  shows,
  pending,
  loadError,
  user,
  onLogOut,
  onOpen,
  onCreate,
  creating,
  createError,
  onDelete,
  deletingId,
}: DashboardVariantProps) {
  const ordered = [...shows].sort(byRecency);
  const [picked, setPicked] = useState<ShowId | null>(null);
  // Derived rather than synced: the rail's default is "the one you touched
  // last", and an effect writing that into state would fight the first click.
  const selectedId = picked ?? ordered[0]?.id ?? null;
  const selected = ordered.find((show) => show.id === selectedId) ?? null;
  const [naming, setNaming] = useState(false);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <DashboardHeader user={user} onLogOut={onLogOut} className="border-b border-border" />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-sidebar">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <h1 className="text-sm font-semibold">
              Shows <span className="pl-1 font-normal text-muted-foreground">{ordered.length}</span>
            </h1>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New Show"
              onClick={() => setNaming(true)}
            >
              <PlusIcon />
            </Button>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto p-1">
            {pending ? <li className="p-3 text-sm text-muted-foreground">Loading Shows…</li> : null}
            {loadError ? (
              <li role="alert" className="p-3 text-sm text-destructive">
                {loadError}
              </li>
            ) : null}
            {ordered.map((show) => (
              <RailItem
                key={show.id}
                show={show}
                active={show.id === selectedId}
                onSelect={() => setPicked(show.id)}
                onOpen={() => onOpen(show.id)}
              />
            ))}
            {!pending && ordered.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">
                No Shows yet. Use + to make one.
              </li>
            ) : null}
          </ul>
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto">
          {selected ? (
            <ShowDetail
              key={selected.id}
              show={selected}
              onOpen={() => onOpen(selected.id)}
              onDelete={() => onDelete(selected.id)}
              deleting={deletingId === selected.id}
            />
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground">
              {pending ? "Loading…" : "Nothing selected."}
            </div>
          )}
        </section>
      </div>

      <NewShowDialog
        open={naming}
        onOpenChange={setNaming}
        onCreate={onCreate}
        creating={creating}
        error={createError}
      />
    </div>
  );
}

interface RailItemProps {
  show: DashboardShow;
  active: boolean;
  onSelect(): void;
  onOpen(): void;
}

function RailItem({ show, active, onSelect, onOpen }: RailItemProps) {
  const preview = useShowPreview(show.id);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/50",
        )}
      >
        <ShowPreview
          scene={preview.hero}
          fit="cover"
          className="h-8 w-12 shrink-0 rounded ring-1 ring-border"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{show.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {relativeTime(show.updatedAt)}
          </span>
        </span>
      </button>
    </li>
  );
}

interface ShowDetailProps {
  show: DashboardShow;
  onOpen(): void;
  onDelete(): void;
  deleting: boolean;
}

function ShowDetail({ show, onOpen, onDelete, deleting }: ShowDetailProps) {
  const preview = useShowPreview(show.id);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col gap-6 p-6 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{show.name}</h2>
          <p className="text-sm text-muted-foreground">
            Updated {relativeTime(show.updatedAt)} · created{" "}
            {new Date(show.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onOpen}>
            <TvMinimalIcon />
            Open in editor
          </Button>
          {/*
            In the open, but not one click from the list: reaching it takes
            selecting the Show first, and firing it takes typing the name.
          */}
          <Button variant="outline" onClick={() => setConfirming(true)}>
            <Trash2Icon />
            Delete
          </Button>
        </div>
      </div>

      {/*
        Fixed height, Scene-shaped width: a 16:9 projector Scene and a 9:16
        phone Scene both come out as big as the pane allows, with no grey
        letterbox bars pretending to be part of the design.
      */}
      <div className="flex h-[42vh] min-h-56 justify-center">
        <ShowPreview
          scene={preview.hero}
          shape="scene"
          className="h-full rounded-lg ring-1 ring-border"
          fallback={
            preview.pending ? null : (
              <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <ImageOffIcon className="size-6" />
                This Show has no Scenes yet
              </span>
            )
          }
        />
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-3 border-y border-border py-3 text-sm">
        {(
          [
            ["Scenes", preview.counts.scenes],
            ["Devices", preview.counts.devices],
            ["Sources", preview.counts.sources],
            ["Flows", preview.counts.flows],
            ["Blocks", preview.counts.blocks],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="text-lg font-medium tabular-nums">{preview.pending ? "–" : value}</dd>
          </div>
        ))}
      </dl>

      {preview.scenes.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Scenes</h3>
          <ul className="flex flex-wrap gap-4">
            {preview.scenes.map((scene) => (
              <li key={scene.artId} className="w-48">
                <ShowPreview scene={scene} className="aspect-[4/3] rounded-md ring-1 ring-border" />
                <p className="truncate pt-1.5 text-sm">{scene.name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {scene.width} × {scene.height}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <DeleteShowDialog
        name={show.name}
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={onDelete}
        deleting={deleting}
        requireName
        blastRadius={`${preview.counts.scenes} Scenes, ${preview.counts.devices} Devices and ${preview.counts.sources} Sources`}
      />
    </div>
  );
}

// PROTOTYPE — issue #604, variant A. Throwaway; plan in ./PrototypeSwitcher.tsx.
//
// GALLERY. The argument: a Show is a visual thing, so the dashboard should be
// mostly picture. Every Show is a card whose body is its biggest Scene painted
// live, the card itself is the button, and the name and counts sit underneath
// as a caption. Nothing else competes.
//
// #604's four points land as: preview cards (the whole layout), the shared
// chrome header, "New Show" as a dashed ghost card that only becomes an input
// once clicked, and Delete moved into a per-card overflow menu behind a
// confirmation.
import {
  Button,
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EllipsisIcon,
  ImageOffIcon,
  PlusIcon,
  Trash2Icon,
  TvMinimalIcon,
} from "@mechane/design-system";
import { useState } from "react";

import { DashboardHeader } from "./DashboardHeader";
import { DeleteShowDialog } from "./DeleteShowDialog";
import { relativeTime } from "./relative-time";
import { ShowPreview } from "./ShowPreview";
import { useShowPreview } from "./use-show-preview";
import { byRecency } from "./variant-props";
import type { DashboardShow, DashboardVariantProps } from "./variant-props";

export function VariantGallery({
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

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader user={user} onLogOut={onLogOut} />

      <main className="mx-auto w-full max-w-[92rem] px-6 pb-28 pt-6">
        <h1 className="pb-6 text-2xl font-semibold tracking-tight">Shows</h1>

        {loadError ? (
          <p role="alert" className="pb-6 text-destructive">
            Couldn't load Shows: {loadError}
          </p>
        ) : null}

        <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))]">
          {ordered.map((show) => (
            <GalleryCard
              key={show.id}
              show={show}
              onOpen={() => onOpen(show.id)}
              onDelete={() => onDelete(show.id)}
              deleting={deletingId === show.id}
            />
          ))}
          <NewShowCard onCreate={onCreate} creating={creating} error={createError} />
          {pending ? (
            <Card className="grid aspect-[16/13] animate-pulse place-items-center text-muted-foreground">
              Loading Shows…
            </Card>
          ) : null}
        </div>
      </main>
    </div>
  );
}

interface GalleryCardProps {
  show: DashboardShow;
  onOpen(): void;
  onDelete(): void;
  deleting: boolean;
}

function GalleryCard({ show, onOpen, onDelete, deleting }: GalleryCardProps) {
  const preview = useShowPreview(show.id);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Card className="gap-0 pt-0 transition-shadow hover:ring-foreground/20 hover:shadow-lg">
        {/*
          The picture is the affordance. A real button rather than a click
          handler on the card so it keeps keyboard focus and a focus ring.
        */}
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
                <span className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                  <ImageOffIcon className="size-5" />
                  No Scenes yet
                </span>
              )
            }
          />
        </button>

        <CardHeader className="pt-4">
          <CardTitle className="truncate">{show.name}</CardTitle>
          <CardDescription className="text-xs">
            {preview.pending
              ? "…"
              : `${preview.counts.scenes} ${preview.counts.scenes === 1 ? "Scene" : "Scenes"} · ${preview.counts.devices} ${preview.counts.devices === 1 ? "Device" : "Devices"}`}
            {` · updated ${relativeTime(show.updatedAt)}`}
          </CardDescription>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label={`${show.name} options`}>
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
        blastRadius={`${preview.counts.scenes} Scenes and ${preview.counts.devices} Devices`}
      />
    </>
  );
}

interface NewShowCardProps {
  onCreate(name: string): void;
  creating: boolean;
  error?: string;
}

/**
 * #604's "don't always show input for new show name": the card is a plus until
 * it is asked to be a form, and it goes back to being a plus on Escape.
 */
function NewShowCard({ onCreate, creating, error }: NewShowCardProps) {
  const [name, setName] = useState<string | null>(null);

  if (name === null) {
    return (
      <button
        type="button"
        onClick={() => setName("")}
        className="grid aspect-[16/13] cursor-pointer place-items-center rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="flex flex-col items-center gap-2">
          <PlusIcon className="size-6" />
          <span className="text-sm font-medium">New Show</span>
        </span>
      </button>
    );
  }

  return (
    <form
      className="flex aspect-[16/13] flex-col justify-center gap-3 rounded-xl border-2 border-dashed border-foreground/30 bg-muted/40 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        onCreate(name);
      }}
    >
      <label className="text-sm font-medium" htmlFor="gallery-new-show">
        Name your Show
      </label>
      <input
        id="gallery-new-show"
        autoFocus
        value={name}
        disabled={creating}
        aria-invalid={error ? true : undefined}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setName(null);
        }}
        className="h-9 w-full rounded-md bg-background px-3 text-sm ring-1 ring-border focus:outline-2 focus:outline-offset-1 focus:outline-ring aria-invalid:ring-destructive"
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={creating || name.trim() === ""}>
          {creating ? "Creating…" : "Create"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setName(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// PROTOTYPE — issue #604, variant C. Throwaway; plan in ./PrototypeSwitcher.tsx.
//
// MARQUEE. The argument: on almost every visit you want the Show you were
// working on five minutes ago, and once in a while you want to find a different
// one. So this page is two unequal halves — one big resume band for the most
// recently touched Show, with its Scenes laid out beside it, over a compact
// table of everything else that is built for scanning, not admiring. Equal
// weight for every Show is exactly what it refuses to give.
//
// #604's four points land as: preview in the band and as a micro-thumbnail in
// every row, the shared chrome header, "New Show" in the header behind a
// popover, and Delete in the row's overflow menu behind a confirmation.
import {
  ArrowRightIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EllipsisIcon,
  ImageOffIcon,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
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

export function VariantMarquee({
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
  const latest = ordered[0] ?? null;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        user={user}
        onLogOut={onLogOut}
        actions={<NewShowPopover onCreate={onCreate} creating={creating} error={createError} />}
      />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-28 pt-4">
        {loadError ? (
          <p role="alert" className="text-destructive">
            Couldn't load Shows: {loadError}
          </p>
        ) : null}

        {latest ? (
          <ResumeBand show={latest} onOpen={() => onOpen(latest.id)} />
        ) : (
          <section className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-lg font-medium">{pending ? "Loading Shows…" : "No Shows yet"}</p>
            {!pending ? (
              <p className="pt-1 text-sm text-muted-foreground">
                Use New Show, up in the header, to start one.
              </p>
            ) : null}
          </section>
        )}

        {ordered.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              All Shows
            </h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-16 py-2 font-medium" scope="col">
                    <span className="sr-only">Preview</span>
                  </th>
                  <th className="py-2 font-medium" scope="col">
                    Show
                  </th>
                  <th className="w-24 py-2 text-right font-medium" scope="col">
                    Scenes
                  </th>
                  <th className="w-24 py-2 text-right font-medium" scope="col">
                    Devices
                  </th>
                  <th className="w-40 py-2 text-right font-medium" scope="col">
                    Updated
                  </th>
                  <th className="w-12 py-2" scope="col">
                    <span className="sr-only">Options</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((show) => (
                  <ShowRow
                    key={show.id}
                    show={show}
                    onOpen={() => onOpen(show.id)}
                    onDelete={() => onDelete(show.id)}
                    deleting={deletingId === show.id}
                  />
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </main>
    </div>
  );
}

interface ResumeBandProps {
  show: DashboardShow;
  onOpen(): void;
}

function ResumeBand({ show, onOpen }: ResumeBandProps) {
  const preview = useShowPreview(show.id);

  return (
    <section className="grid overflow-hidden rounded-xl bg-muted/40 ring-1 ring-border md:grid-cols-[1.3fr_1fr]">
      {/* Cropped rather than fitted: the band is a wide strip, and letterboxing
          a 9:16 audience Scene into it wastes the only big picture on the page. */}
      <ShowPreview
        scene={preview.hero}
        fit="cover"
        className="min-h-64 border-b border-border md:border-b-0 md:border-r"
        fallback={
          preview.pending ? null : (
            <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <ImageOffIcon className="size-6" />
              No Scenes yet
            </span>
          )
        }
      />

      <div className="flex flex-col gap-4 p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Pick up where you left off
        </p>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{show.name}</h1>
          <p className="pt-1 text-sm text-muted-foreground">
            Updated {relativeTime(show.updatedAt)}
            {preview.pending
              ? ""
              : ` · ${preview.counts.scenes} Scenes · ${preview.counts.devices} Devices · ${preview.counts.sources} Sources`}
          </p>
        </div>

        {preview.scenes.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {preview.scenes.slice(0, 5).map((scene) => (
              <li key={scene.artId} className="w-20">
                <ShowPreview
                  scene={scene}
                  fit="cover"
                  className="h-12 rounded ring-1 ring-border"
                />
                <p className="truncate pt-1 text-[0.7rem] leading-tight text-muted-foreground">
                  {scene.name}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        <Button size="lg" className="mt-auto self-start" onClick={onOpen}>
          Open {show.name}
          <ArrowRightIcon />
        </Button>
      </div>
    </section>
  );
}

interface ShowRowProps {
  show: DashboardShow;
  onOpen(): void;
  onDelete(): void;
  deleting: boolean;
}

function ShowRow({ show, onOpen, onDelete, deleting }: ShowRowProps) {
  const preview = useShowPreview(show.id);
  const [confirming, setConfirming] = useState(false);

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/40">
      <td className="py-1.5">
        <ShowPreview
          scene={preview.hero}
          fit="cover"
          className="h-7 w-11 rounded-sm ring-1 ring-border"
        />
      </td>
      <td className="py-1.5">
        {/*
          The name is the link. The row highlights on hover but does not
          activate, so the overflow menu and the row never race for the click.
        */}
        <Button
          variant="link"
          className="h-auto justify-start px-0 text-sm font-medium text-foreground"
          onClick={onOpen}
        >
          {show.name}
        </Button>
      </td>
      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
        {preview.pending ? "–" : preview.counts.scenes}
      </td>
      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
        {preview.pending ? "–" : preview.counts.devices}
      </td>
      <td className="py-1.5 text-right text-muted-foreground">{relativeTime(show.updatedAt)}</td>
      <td className="py-1.5 text-right">
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

        <DeleteShowDialog
          name={show.name}
          open={confirming}
          onOpenChange={setConfirming}
          onConfirm={onDelete}
          deleting={deleting}
          blastRadius={`${preview.counts.scenes} Scenes and ${preview.counts.devices} Devices`}
        />
      </td>
    </tr>
  );
}

interface NewShowPopoverProps {
  onCreate(name: string): void;
  creating: boolean;
  error?: string;
}

/**
 * #604's "don't always show input": the field lives in a popover off the
 * header, so naming a Show is one click away everywhere on the page rather
 * than permanently occupying the top of it.
 */
function NewShowPopover({ onCreate, creating, error }: NewShowPopoverProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setName("");
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button size="sm">
            <PlusIcon />
            New Show
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72">
        <PopoverTitle>New Show</PopoverTitle>
        <PopoverDescription>You can rename it later from the editor.</PopoverDescription>
        <form
          className="flex flex-col gap-1.5 pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate(name);
          }}
        >
          <Label htmlFor="marquee-new-show">Show name</Label>
          <Input
            id="marquee-new-show"
            autoFocus
            value={name}
            disabled={creating}
            aria-invalid={error ? true : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="mt-2" disabled={creating || name.trim() === ""}>
            {creating ? "Creating…" : "Create Show"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

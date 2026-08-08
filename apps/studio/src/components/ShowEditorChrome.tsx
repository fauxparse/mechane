// The Show editor's top chrome (issue #39, spec'd by #22): a bar that
// floats *over* the editor rather than sitting above it, so the editor is
// genuinely full-bleed.
//
// Presentational, like ShowListItem/ShowNameForm — the route wires the
// callbacks to navigation, the rename/delete mutations and the publish
// mutation, which keeps this renderable in Storybook without a router or a
// network.
//
// Two shape decisions worth knowing:
//
//   - The Show name is the dropdown *trigger*, carrying rename and delete
//     (#22 demotes Show settings here rather than giving two rarely-used
//     actions a route of their own).
//   - Rename happens inline, in place of the title, rather than in a
//     dialog: it's a one-field edit, and a modal over an editor the director
//     is mid-thought in costs more than it buys. Escape cancels, Enter
//     commits.
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  cn,
} from "@mechane/design-system";
import type { PublishState } from "@mechane/domain";
import { ChevronDown, LayoutGrid, Pencil, Play, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

export interface ShowEditorChromeProps {
  placement?: "overlay" | "flow";
  name: string;
  publishState: PublishState;
  onBack: () => void;
  onOpenCanvas?: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onPublish: () => void;
  runActive?: boolean;
  onStartRun?: () => void;
  onEndRun?: () => void;
  runPending?: boolean;
  renaming?: boolean;
  renameError?: string;
  deleting?: boolean;
  publishing?: boolean;
}

// "empty" is a Show nobody has drawn anything on yet — it says "Draft"
// rather than "Unpublished changes" because there aren't any changes,
// and Publish stays available but has nothing to move.
const PUBLISH_STATE_LABELS: Record<PublishState, string> = {
  empty: "Draft",
  "unpublished-changes": "Unpublished changes",
  published: "Published",
};

const PUBLISH_STATE_VARIANTS: Record<PublishState, "muted" | "secondary" | "default"> = {
  empty: "muted",
  "unpublished-changes": "secondary",
  published: "default",
};

export function ShowEditorChrome({
  name,
  publishState,
  onBack,
  onOpenCanvas,
  onRename,
  onDelete,
  onPublish,
  placement = "overlay",
  runActive = false,
  onStartRun,
  onEndRun,
  runPending = false,
  renaming,
  renameError,
  deleting,
  publishing,
}: ShowEditorChromeProps) {
  const [draftName, setDraftName] = useState<string | null>(null);
  const isRenaming = draftName !== null;

  const submitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draftName === null) return;
    onRename(draftName);
    setDraftName(null);
  };

  return (
    // `pointer-events-none` on the bar and `pointer-events-auto` on its
    // controls means the gaps between them stay part of the editor — the
    // chrome floats over it without stealing a full-width strip of clicks.
    <div
      className={cn(
        "pointer-events-none z-10 flex items-start gap-3 p-4",
        placement === "flow"
          ? "relative w-full shrink-0 border-b border-border bg-background"
          : "absolute inset-x-0 top-0",
      )}
    >
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label="Back to Shows"
        className="pointer-events-auto shadow-md"
        onClick={onBack}
      >
        <LayoutGrid />
      </Button>

      {isRenaming ? (
        <form className="pointer-events-auto flex items-center gap-2" onSubmit={submitRename}>
          <Input
            autoFocus
            aria-label="Show name"
            value={draftName}
            disabled={renaming}
            aria-invalid={renameError ? true : undefined}
            className="h-9 w-64 bg-background shadow-md"
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setDraftName(null);
            }}
          />
          <Button type="submit" size="sm" disabled={renaming}>
            {renaming ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDraftName(null)}>
            Cancel
          </Button>
        </form>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="lg" />}
            className="pointer-events-auto max-w-xs shadow-md"
          >
            <span className="truncate font-semibold">{name}</span>
            <ChevronDown data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setDraftName(name)}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={deleting} onClick={onDelete}>
              <Trash2 /> {deleting ? "Deleting…" : "Delete Show"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {renameError ? (
        <p role="alert" className="pointer-events-auto self-center text-sm text-destructive">
          {renameError}
        </p>
      ) : null}

      {onOpenCanvas ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="pointer-events-auto shadow-md"
          onClick={onOpenCanvas}
        >
          Canvas
        </Button>
      ) : null}
      <div className="pointer-events-auto ml-auto flex items-center gap-3">
        <Badge variant={PUBLISH_STATE_VARIANTS[publishState]}>
          {PUBLISH_STATE_LABELS[publishState]}
        </Badge>
        {runActive ? <Badge variant="default">Run active</Badge> : null}
        {runActive && onEndRun ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="shadow-md"
            disabled={runPending}
            onClick={onEndRun}
          >
            <Square /> {runPending ? "Ending…" : "End Run"}
          </Button>
        ) : onStartRun ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="shadow-md"
            disabled={runPending}
            onClick={onStartRun}
          >
            <Play /> {runPending ? "Starting…" : "Start Run"}
          </Button>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="shadow-md"
          disabled={publishing}
          onClick={onPublish}
        >
          {publishing ? "Publishing…" : "Publish"}
        </Button>
      </div>
    </div>
  );
}

// The Show editor's top chrome (issue #39, spec'd by #22): a bar that
// floats *over* the canvas rather than sitting above it, so the canvas is
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
//     dialog: it's a one-field edit, and a modal over a canvas the director
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
} from "@presence/design-system";
import type { PublishState } from "@presence/domain";
import { ChevronDown, LayoutGrid, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

export interface ShowEditorChromeProps {
  name: string;
  publishState: PublishState;
  onBack: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onPublish: () => void;
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
  onRename,
  onDelete,
  onPublish,
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
    // controls means the gaps between them stay part of the canvas — the
    // chrome floats over it without stealing a full-width strip of clicks.
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start gap-3 p-4">
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

      <div className="pointer-events-auto ml-auto flex items-center gap-3">
        <Badge variant={PUBLISH_STATE_VARIANTS[publishState]}>
          {PUBLISH_STATE_LABELS[publishState]}
        </Badge>
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

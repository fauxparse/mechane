// A single row in the Show list. Presentational only — the route wires
// `onOpen`/`onDelete` to navigation and the delete mutation, so this stays
// easy to render in Storybook without a router or network. Built from
// @mechane/design-system's Button primitive (issue #14) rather than raw
// <button> elements.
import { Button } from "@mechane/design-system";

export interface ShowListItemProps {
  name: string;
  updatedAt: string;
  onOpen: () => void;
  onDelete: () => void;
  deleting?: boolean;
}

export function ShowListItem({ name, updatedAt, onOpen, onDelete, deleting }: ShowListItemProps) {
  return (
    <li className="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
      <Button
        type="button"
        variant="link"
        className="h-auto flex-1 justify-start px-0 text-left text-base"
        onClick={onOpen}
      >
        {name}
      </Button>
      <span className="text-sm text-muted-foreground">
        Updated {new Date(updatedAt).toLocaleDateString()}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={deleting}
        aria-label={`Delete ${name}`}
      >
        {deleting ? "Deleting…" : "Delete"}
      </Button>
    </li>
  );
}

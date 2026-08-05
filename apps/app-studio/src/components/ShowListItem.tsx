// A single row in the Show list. Presentational only — the route wires
// `onOpen`/`onDelete` to navigation and the delete mutation, so this stays
// easy to render in Storybook without a router or network.
export interface ShowListItemProps {
  name: string;
  updatedAt: string;
  onOpen: () => void;
  onDelete: () => void;
  deleting?: boolean;
}

export function ShowListItem({ name, updatedAt, onOpen, onDelete, deleting }: ShowListItemProps) {
  return (
    <li className="show-list-item">
      <button type="button" className="show-list-item__name" onClick={onOpen}>
        {name}
      </button>
      <span className="show-list-item__meta">
        Updated {new Date(updatedAt).toLocaleDateString()}
      </span>
      <button
        type="button"
        className="show-list-item__delete"
        onClick={onDelete}
        disabled={deleting}
        aria-label={`Delete ${name}`}
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>
    </li>
  );
}

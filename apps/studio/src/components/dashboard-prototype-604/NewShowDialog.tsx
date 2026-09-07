// PROTOTYPE — issue #604. Throwaway; see ./PrototypeSwitcher.tsx for the plan.
//
// Naming a new Show, as a modal. Both places that offer to create one — the
// ghost card at the head of the grid and the no-matches empty state — open
// this, so the question is asked the same way and in the same place on screen
// wherever it comes from.
//
// It still answers #604's "don't always show input for new show name": the
// field does not exist until something asks for it, and Escape or Cancel
// disposes of it. A modal makes that stronger than the old inline form did —
// there is exactly one field on screen and nothing else to look at.
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Label,
} from "@mechane/design-system";
import { useState } from "react";

export interface NewShowDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Prefill. The empty state seeds this with whatever was searched for. */
  initialName?: string;
  onCreate(name: string): void;
  creating: boolean;
  error?: string;
}

export function NewShowDialog(props: NewShowDialogProps) {
  // Remounting on open resets the field. A dialog that reopens holding the
  // name you abandoned last time is a dialog you have to clear first — and it
  // would also ignore a freshly seeded `initialName`.
  return <NewShowDialogBody key={props.open ? "open" : "closed"} {...props} />;
}

function NewShowDialogBody({
  open,
  onOpenChange,
  initialName = "",
  onCreate,
  creating,
  error,
}: NewShowDialogProps) {
  const [name, setName] = useState(initialName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-96 max-w-[92vw]">
        <DialogTitle>New Show</DialogTitle>
        <DialogDescription>You can rename it later from the editor.</DialogDescription>
        <form
          className="pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate(name);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-show-name">Show name</Label>
            <Input
              id="new-show-name"
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
          </div>
          <DialogFooter className="pt-4">
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
            <Button type="submit" disabled={creating || name.trim() === ""}>
              {creating ? "Creating…" : "Create Show"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

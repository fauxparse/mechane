// Confirming that a Show really is meant to go (issue #604).
//
// Deleting a Show takes its whole graph, every Scene and every Canvas with it,
// and `deleteShow` has no undo — so the dashboard asks a question that has to
// be answered rather than offering a button that has to be missed. It replaced
// a one-click Delete sitting in every row of the old list.
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
} from "@mechane/design-system";

export interface DeleteShowDialogProps {
  name: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  onConfirm(): void;
  deleting?: boolean;
  /** What goes with the Show, in the director's words. */
  blastRadius?: string;
}

export function DeleteShowDialog({
  name,
  open,
  onOpenChange,
  onConfirm,
  deleting,
  blastRadius,
}: DeleteShowDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
        <AlertDialogDescription>
          {blastRadius ? `${blastRadius} go with it. ` : ""}
          This cannot be undone.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
          <Button variant="destructive" disabled={deleting} onClick={onConfirm}>
            {deleting ? "Deleting…" : "Delete Show"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

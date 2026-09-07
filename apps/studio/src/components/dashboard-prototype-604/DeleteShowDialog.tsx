// PROTOTYPE — issue #604. Throwaway; see ./PrototypeSwitcher.tsx for the plan.
//
// Issue #604's "get rid of one-click show deletion buttons, this is so
// dangerous". Deleting a Show takes its whole graph, every Scene and every
// Canvas with it, and `deleteShow` has no undo — so the replacement is a
// question that has to be answered, not a button that has to be missed.
//
// `requireName` is the open question the variants disagree about: whether
// "are you sure?" is enough, or whether the Show's name has to be typed. The
// Gallery and Marquee variants ask; the Workbench variant makes you type.
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  Input,
  Label,
} from "@mechane/design-system";
import { useState } from "react";

export interface DeleteShowDialogProps {
  name: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  onConfirm(): void;
  deleting?: boolean;
  /** What goes with the Show, in the director's words. */
  blastRadius?: string;
  requireName?: boolean;
}

export function DeleteShowDialog({
  name,
  open,
  onOpenChange,
  onConfirm,
  deleting,
  blastRadius,
  requireName = false,
}: DeleteShowDialogProps) {
  const [typed, setTyped] = useState("");
  const confirmed = !requireName || typed.trim() === name.trim();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped("");
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
        <AlertDialogDescription>
          {blastRadius ? `${blastRadius} go with it. ` : ""}
          This cannot be undone.
        </AlertDialogDescription>
        {requireName ? (
          <div className="flex flex-col gap-1.5 pt-1">
            <Label htmlFor="delete-show-confirm">
              Type <strong>{name}</strong> to confirm
            </Label>
            <Input
              id="delete-show-confirm"
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
          <Button variant="destructive" disabled={!confirmed || deleting} onClick={onConfirm}>
            {deleting ? "Deleting…" : "Delete Show"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

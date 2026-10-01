// The question asked after a director tried to close the last Studio window
// on a live Show and chose to stay (issue #857). See use-last-window-run-prompt.
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
} from "@mechane/design-system";

export interface LastWindowRunDialogProps {
  showName: string;
  open: boolean;
  onEndRun(): void;
  onKeepRunning(): void;
}

export function LastWindowRunDialog({
  showName,
  open,
  onEndRun,
  onKeepRunning,
}: LastWindowRunDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onKeepRunning()}>
      <AlertDialogContent>
        <AlertDialogTitle>End the run before closing?</AlertDialogTitle>
        <AlertDialogDescription>
          This is the last Studio window open on “{showName}”. If you close it, the run carries on
          for every connected Device.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>Keep running</AlertDialogClose>
          <Button variant="destructive" onClick={onEndRun}>
            End run
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// The question asked when a Device connects to a Show with no Run (issue
// #467). See use-start-run-prompt.
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  PlayIcon,
} from "@mechane/design-system";

import { pluralize } from "../../utils/pluralize";
import type { WaitingDevice } from "./start-run-prompt";

export interface StartRunPromptDialogProps {
  showName: string;
  open: boolean;
  /** The Devices waiting; the first is named, the rest are counted. */
  devices: readonly WaitingDevice[];
  /** Why the Show cannot go live yet, as the header's Go live button has it. */
  goLiveDisabledReason?: string;
  onGoLive(): void;
  onNotNow(): void;
}

export function StartRunPromptDialog({
  showName,
  open,
  devices,
  goLiveDisabledReason,
  onGoLive,
  onNotNow,
}: StartRunPromptDialogProps) {
  const [first, ...others] = devices;
  const waiting = first
    ? others.length === 0
      ? `“${first.name}” is`
      : `“${first.name}” and ${pluralize("other Device", others.length)} are`
    : "A Device is";
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onNotNow()}>
      <AlertDialogContent>
        <AlertDialogTitle>Start the show?</AlertDialogTitle>
        <AlertDialogDescription>
          {waiting} trying to connect, but “{showName}” isn’t running. Devices wait until you go
          live.
        </AlertDialogDescription>
        {goLiveDisabledReason ? (
          <AlertDialogDescription>{goLiveDisabledReason}</AlertDialogDescription>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>Not now</AlertDialogClose>
          <Button disabled={Boolean(goLiveDisabledReason)} onClick={onGoLive}>
            <PlayIcon />
            Go live
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

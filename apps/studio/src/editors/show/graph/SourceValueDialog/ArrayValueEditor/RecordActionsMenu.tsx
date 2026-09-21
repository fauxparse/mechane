import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  ExternalLinkIcon,
  Trash2Icon,
} from "@mechane/design-system";
import { memo, useRef } from "react";

import type { ArrayTableCallbacks, RecordMenuHandle, RecordMenuPayload } from "./array-table-model";

type RecordActionsMenuProps = {
  handle: RecordMenuHandle;
  readOnly: boolean;
  callbacks: ArrayTableCallbacks;
};

/**
 * The per-record action menu, shared by every row through `handle`.
 *
 * Both actions destroy the trigger that opened the menu: deleting removes the
 * row, opening swaps the table out for the record detail view. Running either
 * from the click handler unmounts the anchor while the popup is still playing
 * its close animation, and Base UI's positioner then parks the orphaned popup
 * in the corner of the viewport. So the click only records what to do, and
 * `onOpenChangeComplete` runs it once the popup is gone.
 */
export const RecordActionsMenu = memo(function RecordActionsMenu({
  handle,
  readOnly,
  callbacks,
}: RecordActionsMenuProps) {
  const pendingActionRef = useRef<(() => void) | null>(null);

  return (
    <DropdownMenu<RecordMenuPayload>
      handle={handle}
      onOpenChangeComplete={(open) => {
        if (open) return;
        const action = pendingActionRef.current;
        pendingActionRef.current = null;
        action?.();
      }}
    >
      {({ payload }) => (
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              if (payload) pendingActionRef.current = () => callbacks.openRecord(payload.recordId);
            }}
          >
            <ExternalLinkIcon />
            Open record
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={readOnly}
            onClick={() => {
              if (payload)
                pendingActionRef.current = () => callbacks.deleteRecord(payload.recordId);
            }}
          >
            <Trash2Icon />
            Delete record
          </DropdownMenuItem>
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
});

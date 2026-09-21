import type { DropdownMenuHandle, ImageInputOnUploadProps } from "@mechane/design-system";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type { ShapeField, ShapeRecord } from "./types";

export const DRAG_HANDLE_COLUMN_SIZE = 40;
export const OPEN_COLUMN_SIZE = 44;
export const FIXED_COLUMN_SIZE = DRAG_HANDLE_COLUMN_SIZE + OPEN_COLUMN_SIZE;
export const DEFAULT_COLUMN_SIZE = 150;

export type RecordMenuPayload = { recordId: ShapeRecord["id"] };
export type RecordMenuHandle = DropdownMenuHandle<RecordMenuPayload>;

/**
 * Everything a row or cell needs to talk back to the table.
 *
 * ArrayTable builds this once and never rebuilds it, which is the whole reason
 * `memo` on rows and cells does anything: the props a row receives are its
 * record, its index, and values that only change when the table's own props do.
 * Anything that reads current props has to go through the table's latest-props
 * ref rather than being captured here.
 */
export type ArrayTableCallbacks = {
  changeRecord(record: ShapeRecord): void;
  reportValidity(recordId: ShapeRecord["id"], fieldId: string, error: string | null): void;
  keyDownInCell(
    event: ReactKeyboardEvent<HTMLElement>,
    recordId: ShapeRecord["id"],
    fieldId: string,
  ): void;
  openRecord(recordId: ShapeRecord["id"]): void;
  deleteRecord(recordId: ShapeRecord["id"]): void;
  uploadImage(props: ImageInputOnUploadProps): void;
};

export type ArrayTableColumn = {
  field: ShapeField;
  width: number;
  resizable: boolean;
};

/**
 * Cell geometry. Padding and content height are both scaled by
 * `--array-row-open` (registered in ./array-table.css) so a row can collapse to
 * nothing on exit without any per-cell animation.
 *
 * The content box is 4px taller than its 2rem contents and bleeds 4px sideways
 * past its own padding, which keeps `ring-3` focus rings out of the clip.
 */
export const CELL_PADDING_CLASS = "px-3 py-[calc(var(--array-row-open)*0.5rem)]";
export const CELL_BOX_CLASS =
  "-mx-1 flex h-[calc(var(--array-row-open)*2.5rem)] min-w-0 items-center overflow-hidden px-1";

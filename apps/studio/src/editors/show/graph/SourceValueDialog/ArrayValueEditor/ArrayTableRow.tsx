import { useSortable } from "@dnd-kit/react/sortable";
import { Button, DropdownMenuTrigger, EllipsisIcon, GripVertical } from "@mechane/design-system";
import { m, useIsPresent, type Transition } from "motion/react";
import { memo } from "react";

import type { SourceImageAsset } from "../../inspector/source-value-types";
import { ArrayTableCell } from "./ArrayTableCell";
import {
  CELL_BOX_CLASS,
  CELL_PADDING_CLASS,
  DRAG_HANDLE_COLUMN_SIZE,
  type ArrayTableCallbacks,
  type RecordMenuHandle,
} from "./array-table-model";
import { recordIdentifier, type ShapeField, type ShapeRecord } from "./types";

const rowTransition = {
  duration: 0.18,
  ease: [0.32, 0.72, 0, 1],
} satisfies Transition;

// `--array-row-open` drives cell padding and content height (see
// ./array-table.css). Deliberately no transform: dnd-kit owns the row's
// transform while dragging and the two would fight over it.
const rowCollapsed = { opacity: 0, "--array-row-open": 0 };
const rowOpen = { opacity: 1, "--array-row-open": 1 };

const dragHandleColumnStyle = {
  width: DRAG_HANDLE_COLUMN_SIZE,
  minWidth: DRAG_HANDLE_COLUMN_SIZE,
  maxWidth: DRAG_HANDLE_COLUMN_SIZE,
};

type ArrayTableRowProps = {
  record: ShapeRecord;
  index: number;
  fields: readonly ShapeField[];
  readOnly: boolean;
  canUploadImage: boolean;
  imageAssets?: readonly SourceImageAsset[];
  menu: RecordMenuHandle;
  callbacks: ArrayTableCallbacks;
};

/**
 * A sortable, animated record row.
 *
 * Memoized: with stable callbacks from the table, only the row whose record
 * changed identity re-renders. Column widths deliberately do not reach this
 * component. They live on the table's `<colgroup>`, so dragging a column
 * divider repaints the header and nothing below it.
 */
export const ArrayTableRow = memo(function ArrayTableRow({
  record,
  index,
  fields,
  readOnly,
  canUploadImage,
  imageAssets,
  menu,
  callbacks,
}: ArrayTableRowProps) {
  // While a deleted row plays its exit animation it is still mounted but no
  // longer has a place in the order, so it must not claim a sortable index.
  const isPresent = useIsPresent();
  const { isDragging, isDropTarget, ref, handleRef } = useSortable({
    id: record.id,
    index,
    group: "source-array-records",
    disabled: readOnly || !isPresent,
  });
  const label = recordIdentifier(record, fields, imageAssets);

  return (
    <m.tr
      ref={ref}
      initial={rowCollapsed}
      animate={rowOpen}
      exit={rowCollapsed}
      transition={rowTransition}
      className={`group/row bg-background hover:bg-(--row-hovered) ${isDragging ? "opacity-50" : ""} ${isDropTarget ? "ring-2 ring-inset ring-primary" : ""}`}
    >
      <td
        style={dragHandleColumnStyle}
        className="sticky left-0 z-10 bg-inherit px-2 py-[calc(var(--array-row-open)*0.5rem)]"
      >
        {readOnly ? null : (
          <div className={CELL_BOX_CLASS}>
            <button
              ref={handleRef}
              type="button"
              aria-label={`Reorder ${label}`}
              aria-roledescription="sortable"
              className="touch-none cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
            >
              <GripVertical className="size-4" />
            </button>
          </div>
        )}
      </td>
      {fields.map((field) => (
        <td
          key={field.id}
          data-table-cell
          data-table-row-id={record.id}
          data-table-column-id={field.id}
          className={`whitespace-nowrap ${CELL_PADDING_CLASS}`}
        >
          <div className={CELL_BOX_CLASS}>
            <ArrayTableCell
              field={field}
              record={record}
              value={record.fields[field.id]}
              readOnly={readOnly}
              canUploadImage={canUploadImage}
              imageAssets={imageAssets}
              callbacks={callbacks}
            />
          </div>
        </td>
      ))}
      <td className={`sticky right-0 z-10 bg-inherit whitespace-nowrap ${CELL_PADDING_CLASS}`}>
        <div className={CELL_BOX_CLASS}>
          <DropdownMenuTrigger
            handle={menu}
            payload={{ recordId: record.id }}
            render={
              <Button variant="ghost" size="icon-sm" aria-label={`${label} options`}>
                <EllipsisIcon />
              </Button>
            }
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      </td>
    </m.tr>
  );
});

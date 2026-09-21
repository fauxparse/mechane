import type { PointerEvent as ReactPointerEvent } from "react";

import {
  DRAG_HANDLE_COLUMN_SIZE,
  OPEN_COLUMN_SIZE,
  type ArrayTableColumn,
} from "./array-table-model";

const dragHandleColumnStyle = {
  width: DRAG_HANDLE_COLUMN_SIZE,
  minWidth: DRAG_HANDLE_COLUMN_SIZE,
  maxWidth: DRAG_HANDLE_COLUMN_SIZE,
};

type ArrayTableHeaderProps = {
  columns: readonly ArrayTableColumn[];
  readOnly: boolean;
  resizingColumnId: string | null;
  onResizeStart(event: ReactPointerEvent<HTMLDivElement>, columnId: string, size: number): void;
  onResizeMove(event: ReactPointerEvent<HTMLDivElement>): void;
  onResizeEnd(event: ReactPointerEvent<HTMLDivElement>): void;
};

/**
 * Header row and the column resize handles.
 *
 * This is the only part of the table that re-renders while a divider is being
 * dragged: widths reach the body through `<colgroup>`, not through the rows.
 */
export function ArrayTableHeader({
  columns,
  readOnly,
  resizingColumnId,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: ArrayTableHeaderProps) {
  return (
    <thead className="bg-background **:[th]:label **:[th]:font-normal **:[th]:sticky **:[th]:top-0 **:[th]:bg-background **:[th]:border-t-0 **:[th]:inset-shadow-[0_-1px_0_0_var(--color-border)]">
      <tr>
        <th
          style={dragHandleColumnStyle}
          className="left-0 z-30 px-3 py-2.5"
          aria-label={readOnly ? undefined : "Reorder"}
        />
        {columns.map((column) => (
          <th key={column.field.id} className="z-20 whitespace-nowrap px-3 py-2.5">
            {column.field.name}
            {column.resizable ? (
              <div
                role="separator"
                tabIndex={0}
                aria-orientation="vertical"
                aria-label={`Resize ${column.field.name}`}
                onPointerDown={(event) => onResizeStart(event, column.field.id, column.width)}
                onPointerMove={onResizeMove}
                onPointerUp={onResizeEnd}
                onPointerCancel={onResizeEnd}
                className="absolute inset-y-0 right-0 z-10 w-1 cursor-col-resize touch-none select-none border-t-0 border-r border-border"
                data-resizing={resizingColumnId === column.field.id || undefined}
              />
            ) : null}
          </th>
        ))}
        <th
          style={{
            width: OPEN_COLUMN_SIZE,
            minWidth: OPEN_COLUMN_SIZE,
            maxWidth: OPEN_COLUMN_SIZE,
          }}
          className="right-0 z-30 whitespace-nowrap px-3 py-2.5"
        />
      </tr>
    </thead>
  );
}

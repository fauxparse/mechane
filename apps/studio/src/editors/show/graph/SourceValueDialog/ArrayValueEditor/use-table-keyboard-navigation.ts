import { useCallback, type KeyboardEvent, type RefObject } from "react";

type CellPosition = {
  rowIndex: number;
  columnIndex: number;
};

export function nextTableCell(
  position: CellPosition,
  key: string,
  rowCount: number,
  columnCount: number,
): CellPosition | "create-row" | null {
  const { rowIndex, columnIndex } = position;
  switch (key) {
    case "ArrowRight":
      return columnIndex < columnCount - 1
        ? { rowIndex, columnIndex: columnIndex + 1 }
        : rowIndex < rowCount - 1
          ? { rowIndex: rowIndex + 1, columnIndex: 0 }
          : null;
    case "ArrowLeft":
      return columnIndex > 0
        ? { rowIndex, columnIndex: columnIndex - 1 }
        : rowIndex > 0
          ? { rowIndex: rowIndex - 1, columnIndex: columnCount - 1 }
          : null;
    case "ArrowDown":
      return rowIndex < rowCount - 1 ? { rowIndex: rowIndex + 1, columnIndex } : null;
    case "ArrowUp":
      return rowIndex > 0 ? { rowIndex: rowIndex - 1, columnIndex } : null;
    case "Home":
      return { rowIndex, columnIndex: 0 };
    case "End":
      return { rowIndex, columnIndex: columnCount - 1 };
    case "PageDown":
      return { rowIndex: Math.min(rowIndex + 10, rowCount - 1), columnIndex };
    case "PageUp":
      return { rowIndex: Math.max(rowIndex - 10, 0), columnIndex };
    case "Enter":
      return columnIndex < columnCount - 1
        ? { rowIndex, columnIndex: columnIndex + 1 }
        : rowIndex < rowCount - 1
          ? { rowIndex: rowIndex + 1, columnIndex: 0 }
          : "create-row";
    default:
      return null;
  }
}

type UseTableKeyboardNavigationOptions = {
  containerRef: RefObject<HTMLElement | null>;
  columnIds: readonly string[];
  rowCount: number;
  readOnly: boolean;
  onCreateRow?(): string | null;
};

export function useTableKeyboardNavigation({
  containerRef,
  columnIds,
  rowCount,
  readOnly,
  onCreateRow,
}: UseTableKeyboardNavigationOptions) {
  const focusCell = useCallback(
    ({ rowIndex, columnIndex }: CellPosition) => {
      const columnId = columnIds[columnIndex];
      if (!columnId) return;
      const cell = containerRef.current?.querySelector<HTMLElement>(
        `[data-table-cell="${rowIndex}:${columnId}"]`,
      );
      const focusable = cell?.querySelector<HTMLElement>(
        "input:not([aria-hidden='true']), button:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      focusable?.focus();
    },
    [columnIds, containerRef],
  );

  const onCellKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, rowIndex: number, columnIndex: number) => {
      if (readOnly) return;
      if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        event.target instanceof HTMLInputElement
      ) {
        const { selectionStart, selectionEnd, value } = event.target;
        if (
          (event.key === "ArrowLeft" && selectionStart !== 0) ||
          (event.key === "ArrowRight" && selectionEnd !== value.length)
        ) {
          return;
        }
      }
      const next = nextTableCell({ rowIndex, columnIndex }, event.key, rowCount, columnIds.length);
      if (!next) return;
      event.preventDefault();
      if (next === "create-row") {
        const id = onCreateRow?.();
        if (id) requestAnimationFrame(() => focusCell({ rowIndex: rowCount, columnIndex: 0 }));
        return;
      }
      focusCell(next);
    },
    [columnIds.length, focusCell, onCreateRow, readOnly, rowCount],
  );

  return { onCellKeyDown };
}

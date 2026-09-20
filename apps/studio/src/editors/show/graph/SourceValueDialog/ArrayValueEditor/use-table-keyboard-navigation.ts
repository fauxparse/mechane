import { useCallback, type KeyboardEvent, type RefObject } from "react";

type CellPosition = {
  rowIndex: number;
  columnIndex: number;
};

type TableCellKeyContext = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  target: "input" | "button" | "other";
  selectionStart?: number | null;
  selectionEnd?: number | null;
  valueLength?: number;
};

/**
 * Returns the navigation key a cell should handle, leaving text editing and
 * native button activation alone.
 */
export function tableCellNavigationKey(context: TableCellKeyContext): string | null {
  if (context.isComposing || context.altKey || context.ctrlKey || context.metaKey) return null;
  if (context.target === "button" && (context.key === "Enter" || context.key === " ")) return null;
  if (context.target !== "input") return context.key;
  if (context.shiftKey) return null;
  if (context.key === "Home" || context.key === "End") return null;
  if (context.key !== "ArrowLeft" && context.key !== "ArrowRight") return context.key;

  const { selectionStart, selectionEnd, valueLength = 0 } = context;
  if (selectionStart === null || selectionEnd === null || selectionStart !== selectionEnd)
    return null;
  if (context.key === "ArrowLeft") return selectionStart === 0 ? context.key : null;
  return selectionEnd === valueLength ? context.key : null;
}

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
  rowIds: readonly string[];
  rowCount: number;
  readOnly: boolean;
  onCreateRow?(): string | null;
};

export function useTableKeyboardNavigation({
  containerRef,
  columnIds,
  rowIds,
  rowCount,
  readOnly,
  onCreateRow,
}: UseTableKeyboardNavigationOptions) {
  const focusCellById = useCallback(
    (rowId: string, columnIndex: number) => {
      const columnId = columnIds[columnIndex];
      if (!columnId) return;
      const cell = [
        ...(containerRef.current?.querySelectorAll<HTMLElement>("[data-table-cell]") ?? []),
      ].find(
        (candidate) =>
          candidate.dataset.tableRowId === rowId && candidate.dataset.tableColumnId === columnId,
      );
      const focusable = cell?.querySelector<HTMLElement>(
        "input:not([type='file']):not([disabled]):not([aria-hidden='true']), button:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      focusable?.focus();
    },
    [columnIds, containerRef],
  );

  const focusCell = useCallback(
    ({ rowIndex, columnIndex }: CellPosition) => {
      const rowId = rowIds[rowIndex];
      if (rowId) focusCellById(rowId, columnIndex);
    },
    [focusCellById, rowIds],
  );

  const onCellKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, rowIndex: number, columnIndex: number) => {
      if (readOnly) return;
      const target = event.target;
      const key = tableCellNavigationKey({
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
        target:
          target instanceof HTMLInputElement
            ? "input"
            : target instanceof HTMLButtonElement
              ? "button"
              : "other",
        selectionStart: target instanceof HTMLInputElement ? target.selectionStart : undefined,
        selectionEnd: target instanceof HTMLInputElement ? target.selectionEnd : undefined,
        valueLength: target instanceof HTMLInputElement ? target.value.length : undefined,
      });
      if (!key) return;
      const next = nextTableCell({ rowIndex, columnIndex }, key, rowCount, columnIds.length);
      if (!next) return;
      if (next === "create-row") {
        const id = onCreateRow?.();
        if (!id) return;
        event.preventDefault();
        requestAnimationFrame(() => focusCellById(id, 0));
        return;
      }
      event.preventDefault();
      focusCell(next);
    },
    [columnIds.length, focusCell, focusCellById, onCreateRow, readOnly, rowCount],
  );

  return { onCellKeyDown };
}

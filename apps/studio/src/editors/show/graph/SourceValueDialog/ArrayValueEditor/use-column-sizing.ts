import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

export const MIN_COLUMN_SIZE = 96;

type ColumnSizes = Record<string, number>;

export function distributeColumnSizes(
  columnIds: readonly string[],
  savedSizes: ColumnSizes | undefined,
  availableWidth: number,
  minimum = MIN_COLUMN_SIZE,
): ColumnSizes {
  if (columnIds.length === 0) return {};
  const next = Object.fromEntries(
    columnIds.map((id) => [id, Math.max(minimum, savedSizes?.[id] ?? 150)]),
  );
  const saved = savedSizes && Object.keys(savedSizes).length > 0;
  if (!saved) {
    const size = Math.max(minimum, availableWidth / columnIds.length);
    return Object.fromEntries(columnIds.map((id) => [id, size]));
  }
  const total = columnIds.reduce((sum, id) => sum + (next[id] ?? minimum), 0);
  const lastId = columnIds.at(-1);
  if (lastId && availableWidth > total)
    next[lastId] = (next[lastId] ?? minimum) + availableWidth - total;
  return next;
}

export function resizeColumnSizes({
  columnIds,
  startSizes,
  columnId,
  delta,
  minimum = MIN_COLUMN_SIZE,
  availableWidth,
  fixedWidth = 0,
}: {
  columnIds: readonly string[];
  startSizes: ColumnSizes;
  columnId: string;
  delta: number;
  minimum?: number;
  availableWidth?: number;
  fixedWidth?: number;
}): ColumnSizes {
  const next = { ...startSizes };
  const columnIndex = columnIds.indexOf(columnId);
  const startSize = startSizes[columnId] ?? minimum;
  if (columnIndex < 0) return next;
  if (delta >= 0) {
    const leftTotal = columnIds
      .slice(0, columnIndex)
      .reduce((total, id) => total + (startSizes[id] ?? minimum), 0);
    const rightMinimum = (columnIds.length - columnIndex - 1) * minimum;
    const maxSize =
      availableWidth && availableWidth > 0
        ? Math.max(startSize, availableWidth - fixedWidth - leftTotal - rightMinimum)
        : Number.POSITIVE_INFINITY;
    let remaining = Math.min(delta, maxSize - startSize);
    for (const id of columnIds.slice(columnIndex + 1)) {
      const size = startSizes[id] ?? minimum;
      const shrink = Math.min(Math.max(0, size - minimum), remaining);
      next[id] = size - shrink;
      remaining -= shrink;
    }
    next[columnId] = startSize + Math.min(delta, maxSize - startSize);
    return next;
  }
  const nextSize = Math.max(minimum, startSize + delta);
  next[columnId] = nextSize;
  const firstRight = columnIds[columnIndex + 1];
  if (firstRight) next[firstRight] = (startSizes[firstRight] ?? minimum) + startSize - nextSize;
  return next;
}

type UseColumnSizingOptions = {
  columnIds: readonly string[];
  savedSizes?: ColumnSizes;
  containerRef: RefObject<HTMLElement | null>;
  fixedWidth: number;
  enabled: boolean;
  onCommit?(sizes: ColumnSizes): void;
};

export function useColumnSizing({
  columnIds,
  savedSizes,
  containerRef,
  fixedWidth,
  enabled,
  onCommit,
}: UseColumnSizingOptions) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [columnSizes, setColumnSizes] = useState<ColumnSizes>(savedSizes ?? {});
  const columnSizesRef = useRef(columnSizes);
  const activeRef = useRef<{
    id: string;
    startX: number;
    startSizes: ColumnSizes;
    startSize: number;
  } | null>(null);
  const initializedKeyRef = useRef<string | null>(null);
  const [resizingColumnId, setResizingColumnId] = useState<string | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);

  useEffect(() => {
    if (containerWidth <= 0 || columnIds.length === 0) return;
    const key = `${containerWidth}:${JSON.stringify(savedSizes ?? {})}`;
    if (initializedKeyRef.current === key) return;
    const next = distributeColumnSizes(
      columnIds,
      savedSizes,
      Math.max(0, containerWidth - fixedWidth),
    );
    initializedKeyRef.current = key;
    columnSizesRef.current = next;
    setColumnSizes(next);
  }, [columnIds, containerWidth, fixedWidth, savedSizes]);

  const startResize = (event: PointerEvent<HTMLDivElement>, id: string, size: number) => {
    if (!enabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeRef.current = {
      id,
      startX: event.clientX,
      startSizes: { ...columnSizesRef.current },
      startSize: size,
    };
    setResizingColumnId(id);
  };

  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    const active = activeRef.current;
    if (!active || !enabled) return;
    const next = resizeColumnSizes({
      columnIds,
      startSizes: active.startSizes,
      columnId: active.id,
      delta: event.clientX - active.startX,
      availableWidth: containerWidth,
      fixedWidth,
    });
    columnSizesRef.current = next;
    setColumnSizes(next);
  };

  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (activeRef.current) onCommit?.(columnSizesRef.current);
    activeRef.current = null;
    setResizingColumnId(null);
  };

  return { columnSizes, containerWidth, resizingColumnId, startResize, moveResize, finishResize };
}

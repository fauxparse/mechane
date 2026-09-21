import { defaultPreset, PointerActivationConstraints } from "@dnd-kit/dom";
import type { DragEndEvent } from "@dnd-kit/react";
import { DragDropProvider, PointerSensor } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import {
  createDropdownMenuHandle,
  VibeProvider,
  type ImageInputOnUploadProps,
} from "@mechane/design-system";
import type { Shape } from "@mechane/domain";
import { AnimatePresence, domAnimation, LazyMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";

import type { ErrorPath, SourceImageAsset } from "../../inspector/source-value-types";
import {
  DEFAULT_COLUMN_SIZE,
  DRAG_HANDLE_COLUMN_SIZE,
  FIXED_COLUMN_SIZE,
  OPEN_COLUMN_SIZE,
  type ArrayTableCallbacks,
  type ArrayTableColumn,
  type RecordMenuPayload,
} from "./array-table-model";
import "./array-table.css";
import { ArrayTableHeader } from "./ArrayTableHeader";
import { ArrayTableRow } from "./ArrayTableRow";
import { RecordActionsMenu } from "./RecordActionsMenu";
import type { ShapeRecord } from "./types";
import { MIN_COLUMN_SIZE, useColumnSizing } from "./use-column-sizing";
import { useTableKeyboardNavigation } from "./use-table-keyboard-navigation";

const tableSensors = (defaults: typeof defaultPreset.sensors) =>
  defaults.map((sensor) =>
    sensor === PointerSensor
      ? PointerSensor.configure({
          activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
        })
      : sensor,
  );

type ArrayTableProps = {
  records: ShapeRecord[];
  fields: Shape["fields"];
  readOnly: boolean;
  columnSizes?: Record<string, number>;
  imageAssets?: readonly SourceImageAsset[];
  path: ErrorPath;
  onColumnSizesChange?(columnSizes: Record<string, number>): void;
  onImageUpload?: (props: ImageInputOnUploadProps) => void;
  onReorder(sourceId: string, targetId: string): void;
  onRecordChange(record: ShapeRecord): void;
  onValidityChange(path: ErrorPath, error: string | null): void;
  onOpenRecord(id: string): void;
  onDeleteRecord(id: ShapeRecord["id"]): void;
  onCreateRecord?(): string | null;
};

export function ArrayTable({
  records,
  fields,
  readOnly,
  columnSizes,
  imageAssets,
  path,
  onColumnSizesChange,
  onImageUpload,
  onReorder,
  onRecordChange,
  onValidityChange,
  onOpenRecord,
  onDeleteRecord,
  onCreateRecord,
}: ArrayTableProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const recordMenu = useMemo(() => createDropdownMenuHandle<RecordMenuPayload>(), []);

  const columnIds = useMemo(() => fields.map((field) => field.id), [fields]);
  const rowIds = useMemo(() => records.map((record) => record.id), [records]);

  const {
    columnSizes: localColumnSizes,
    containerWidth,
    resizingColumnId,
    startResize,
    moveResize,
    finishResize,
  } = useColumnSizing({
    columnIds,
    savedSizes: columnSizes,
    containerRef,
    fixedWidth: FIXED_COLUMN_SIZE,
    enabled: !readOnly && Boolean(onColumnSizesChange),
    onCommit: onColumnSizesChange,
  });

  const { onCellKeyDown } = useTableKeyboardNavigation({
    containerRef,
    columnIds,
    rowIds,
    readOnly,
    onCreateRow: onCreateRecord,
  });

  // Rows and cells are memoized, so every callback they receive has to keep the
  // same identity for the life of the table. They call through this box instead
  // of closing over props directly.
  const latestRef = useRef({
    onRecordChange,
    onValidityChange,
    onOpenRecord,
    onDeleteRecord,
    onImageUpload,
    onCellKeyDown,
    path,
  });
  useEffect(() => {
    latestRef.current = {
      onRecordChange,
      onValidityChange,
      onOpenRecord,
      onDeleteRecord,
      onImageUpload,
      onCellKeyDown,
      path,
    };
  });

  const callbacks = useMemo<ArrayTableCallbacks>(
    () => ({
      changeRecord: (record) => latestRef.current.onRecordChange(record),
      reportValidity: (recordId, fieldId, error) =>
        latestRef.current.onValidityChange([...latestRef.current.path, recordId, fieldId], error),
      keyDownInCell: (event, recordId, fieldId) =>
        latestRef.current.onCellKeyDown(event, recordId, fieldId),
      openRecord: (recordId) => latestRef.current.onOpenRecord(recordId),
      deleteRecord: (recordId) => latestRef.current.onDeleteRecord(recordId),
      uploadImage: (props) => latestRef.current.onImageUpload?.(props),
    }),
    [],
  );

  const columns = useMemo<ArrayTableColumn[]>(() => {
    // Once the columns no longer fit, the last one gets a handle too, otherwise
    // there would be no way to shrink it back.
    const lastColumnResizable =
      containerWidth <= FIXED_COLUMN_SIZE + fields.length * MIN_COLUMN_SIZE;
    return fields.map((field, index) => ({
      field,
      width: localColumnSizes[field.id] ?? DEFAULT_COLUMN_SIZE,
      resizable: !readOnly && (index < fields.length - 1 || lastColumnResizable),
    }));
  }, [containerWidth, fields, localColumnSizes, readOnly]);

  const tableWidth = Math.max(
    containerWidth,
    columns.reduce((total, column) => total + column.width, 0) +
      DRAG_HANDLE_COLUMN_SIZE +
      OPEN_COLUMN_SIZE,
  );

  const finishDrag = (event: DragEndEvent) => {
    if (readOnly || event.canceled) return;
    const source = event.operation.source;
    const target = event.operation.target;
    if (!source || !target || !isSortable(source) || !isSortable(target)) return;
    if (typeof source.id !== "string") return;
    const targetRecord = records[target.index];
    if (!targetRecord) return;
    onReorder(source.id, targetRecord.id);
  };

  return (
    <div
      ref={containerRef}
      className="min-w-0 overflow-auto overscroll-x-contain overscroll-y-none border-t border-b border-border [--background:var(--color-popover)] [--row-hovered:var(--palette-neutral-600)]"
    >
      <VibeProvider vibe="table">
        <RecordActionsMenu handle={recordMenu} readOnly={readOnly} callbacks={callbacks} />
        <LazyMotion features={domAnimation}>
          <DragDropProvider sensors={tableSensors} onDragEnd={finishDrag}>
            <table className="table-fixed text-left text-sm" style={{ width: tableWidth }}>
              <colgroup>
                <col style={{ width: DRAG_HANDLE_COLUMN_SIZE }} />
                {columns.map((column) => (
                  <col key={column.field.id} style={{ width: column.width }} />
                ))}
                <col style={{ width: OPEN_COLUMN_SIZE }} />
              </colgroup>
              <ArrayTableHeader
                columns={columns}
                readOnly={readOnly}
                resizingColumnId={resizingColumnId}
                onResizeStart={startResize}
                onResizeMove={moveResize}
                onResizeEnd={finishResize}
              />
              <tbody className="divide-y divide-border">
                {/* `presenceAffectsLayout` would hand every row a fresh presence
                    context on each render, re-rendering all of them. It exists to
                    retrigger Motion layout animations, and this table has none. */}
                <AnimatePresence initial={false} presenceAffectsLayout={false}>
                  {records.map((record, index) => (
                    <ArrayTableRow
                      key={record.id}
                      record={record}
                      index={index}
                      fields={fields}
                      readOnly={readOnly}
                      canUploadImage={Boolean(onImageUpload)}
                      imageAssets={imageAssets}
                      menu={recordMenu}
                      callbacks={callbacks}
                    />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </DragDropProvider>
        </LazyMotion>
        {records.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No records match this filter.
          </p>
        ) : null}
      </VibeProvider>
    </div>
  );
}

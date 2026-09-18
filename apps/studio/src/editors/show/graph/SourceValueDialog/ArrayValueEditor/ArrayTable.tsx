import { defaultPreset, PointerActivationConstraints } from "@dnd-kit/dom";
import type { DragEndEvent } from "@dnd-kit/react";
import { DragDropProvider, PointerSensor } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  ChevronRight,
  GripVertical,
  ImageInput,
  PropertyInput,
  Switch,
  variableTypeIcon,
  VibeProvider,
  type ImageInputOnUploadProps,
  type PropertyInputValue,
} from "@mechane/design-system";
import {
  isImageAssetReference,
  isResolvedImageValue,
  isShapeStructuredValueTemplate,
  setValueAtPath,
  type Shape,
} from "@mechane/domain";
import {
  columnResizingFeature,
  columnSizingFeature,
  coreCellsFeature,
  coreColumnsFeature,
  coreHeadersFeature,
  coreRowModelsFeature,
  coreRowsFeature,
  coreTablesFeature,
  createColumnHelper,
  flexRender,
  tableFeatures,
  useTable,
  type ColumnSizingState,
  type Row,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { SourceImagePreview } from "../ValueEditor";

import type { ErrorPath, SourceImageAsset } from "../../inspector/source-value-types";
import { previewValue, propertyInputType } from "../../inspector/source-values-helpers";
import type { ShapeRecord } from "./types";
import { recordIdentifier } from "./types";
import { useColumnSizing } from "./use-column-sizing";
import { useTableKeyboardNavigation } from "./use-table-keyboard-navigation";

const tableSensors = (defaults: typeof defaultPreset.sensors) =>
  defaults.map((sensor) =>
    sensor === PointerSensor
      ? PointerSensor.configure({
          activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
        })
      : sensor,
  );

const features = tableFeatures({
  coreCellsFeature,
  coreColumnsFeature,
  coreHeadersFeature,
  coreRowModelsFeature,
  coreRowsFeature,
  coreTablesFeature,
  columnSizingFeature,
  columnResizingFeature,
});

const columnHelper = createColumnHelper<typeof features, ShapeRecord>();

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
  onCreateRecord,
}: {
  records: ShapeRecord[];
  fields: Shape["fields"];
  readOnly: boolean;
  columnSizes?: ColumnSizingState;
  imageAssets?: readonly SourceImageAsset[];
  path: ErrorPath;
  onColumnSizesChange?(columnSizes: ColumnSizingState): void;
  onImageUpload?: (props: ImageInputOnUploadProps) => void;
  onReorder(sourceId: string, targetId: string): void;
  onRecordChange(record: ShapeRecord): void;
  onValidityChange(path: ErrorPath, error: string | null): void;
  onOpenRecord(id: string): void;
  onCreateRecord?(): string | null;
}) {
  const recordChangeRef = useRef(onRecordChange);
  const validityChangeRef = useRef(onValidityChange);
  const pathRef = useRef(path);
  const openRecordRef = useRef(onOpenRecord);

  useEffect(() => {
    recordChangeRef.current = onRecordChange;
    validityChangeRef.current = onValidityChange;
    pathRef.current = path;
    openRecordRef.current = onOpenRecord;
  }, [onRecordChange, onValidityChange, onOpenRecord, path]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const {
    columnSizes: localColumnSizes,
    containerWidth,
    resizingColumnId,
    startResize,
    moveResize,
    finishResize,
  } = useColumnSizing({
    columnIds: fields.map((field) => field.id),
    savedSizes: columnSizes,
    containerRef,
    fixedWidth: 84,
    enabled: !readOnly && Boolean(onColumnSizesChange),
    onCommit: onColumnSizesChange,
  });

  const { onCellKeyDown } = useTableKeyboardNavigation({
    containerRef,
    columnIds: fields.map((field) => field.id),
    rowCount: records.length,
    readOnly,
    onCreateRow: onCreateRecord,
  });

  const columns = useMemo(
    () =>
      columnHelper.columns([
        ...fields.map((field) =>
          columnHelper.accessor((record) => previewValue(record.fields[field.id]), {
            id: field.id,
            header: field.name,
            enableResizing: !readOnly,
            cell: ({ row }) => (
              <TableValueCell
                field={field}
                value={row.original.fields[field.id]}
                record={row.original}
                readOnly={readOnly}
                imageAssets={imageAssets}
                onImageUpload={onImageUpload}
                path={[...pathRef.current, row.original.id, field.id]}
                onKeyDown={(event) =>
                  onCellKeyDown(
                    event,
                    row.index,
                    fields.findIndex((candidate) => candidate.id === field.id),
                  )
                }
                onRecordChange={(record) => recordChangeRef.current(record)}
                onValidityChange={(nextPath, error) => validityChangeRef.current(nextPath, error)}
              />
            ),
          }),
        ),
        columnHelper.display({
          id: "open",
          enableResizing: false,
          size: 44,
          header: "",
          cell: ({ row }) => (
            <button
              type="button"
              className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Open ${recordIdentifier(row.original, fields, imageAssets)}`}
              onClick={(event) => {
                event.stopPropagation();
                openRecordRef.current(row.original.id);
              }}
            >
              <ChevronRight className="size-4" />
            </button>
          ),
        }),
      ]),
    [fields, imageAssets, onCellKeyDown, onImageUpload, readOnly],
  );

  const table = useTable({
    features,
    data: records,
    columns,
    columnResizeMode: "onChange",
    state: { columnSizing: localColumnSizes },
    getRowId: (record) => record.id,
  });

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
      className="min-w-0 overflow-auto overscroll-x-contain border-t border-b border-border"
    >
      <VibeProvider vibe="table">
        <DragDropProvider sensors={tableSensors} onDragEnd={finishDrag}>
          <table
            className="table-fixed text-left text-sm"
            style={{ width: Math.max(containerWidth, table.getTotalSize() + 40) }}
          >
            <colgroup>
              <col style={{ width: 40 }} />
              {table.getAllLeafColumns().map((column) => (
                <col key={column.id} style={{ width: column.getSize() }} />
              ))}
            </colgroup>
            <thead className="bg-muted/45 text-[11px] uppercase tracking-wide text-muted-foreground">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  <th
                    className="sticky left-0 z-20 w-10 bg-muted/45 px-3 py-2.5 shadow-[2px_0_4px_-2px_rgb(0_0_0/0.25)]"
                    aria-label={readOnly ? undefined : "Reorder"}
                  />
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      colSpan={header.colSpan}
                      style={{ width: header.getSize() }}
                      className={`relative whitespace-nowrap px-3 py-2.5 font-medium ${
                        header.column.id === "open"
                          ? "sticky right-0 z-20 bg-muted/45 shadow-[-2px_0_4px_-2px_rgb(0_0_0/0.25)]"
                          : ""
                      }`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanResize() ? (
                        <div
                          role="separator"
                          tabIndex={0}
                          aria-orientation="vertical"
                          aria-label={`Resize ${String(header.column.columnDef.header ?? header.id)}`}
                          onPointerDown={(event) =>
                            startResize(event, header.column.id, header.column.getSize())
                          }
                          onPointerMove={moveResize}
                          onPointerUp={finishResize}
                          onPointerCancel={finishResize}
                          className="absolute inset-y-0 right-0 z-10 w-1 cursor-col-resize touch-none select-none border-r border-border"
                          data-resizing={resizingColumnId === header.column.id || undefined}
                        />
                      ) : null}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border">
              {table.getRowModel().rows.map((row) => (
                <SortableTableRow key={row.id} row={row} readOnly={readOnly} />
              ))}
            </tbody>
          </table>
        </DragDropProvider>
        {records.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No records match this filter.
          </p>
        ) : null}
      </VibeProvider>
    </div>
  );
}

function TableValueCell({
  field,
  value,
  record,
  readOnly,
  imageAssets,
  onImageUpload,
  path,
  onKeyDown,
  onRecordChange,
  onValidityChange,
}: {
  field: Shape["fields"][number];
  value: unknown;
  record: ShapeRecord;
  readOnly: boolean;
  imageAssets?: readonly SourceImageAsset[];
  onImageUpload?: (props: ImageInputOnUploadProps) => void;
  path: ErrorPath;
  onKeyDown?(event: ReactKeyboardEvent<HTMLElement>): void;
  onRecordChange(record: ShapeRecord): void;
  onValidityChange(path: ErrorPath, error: string | null): void;
}) {
  const updateValue = (nextValue: unknown) => {
    const updated = setValueAtPath(record, [field.id], nextValue);
    if (isShapeStructuredValueTemplate(updated)) onRecordChange(updated);
  };
  if (field.type === "image") {
    const resolvedValue = isResolvedImageValue(value)
      ? value
      : isImageAssetReference(value)
        ? (imageAssets?.find(
            (asset) => asset.assetId === value.assetId && asset.revision === value.revision,
          ) ?? null)
        : null;
    if (readOnly || !onImageUpload) {
      return (
        <div className="h-8" role="group" tabIndex={0} onKeyDown={onKeyDown}>
          <SourceImagePreview value={value} imageAssets={imageAssets} className="max-w-44" />
        </div>
      );
    }
    return (
      <div className="h-8" role="group" tabIndex={0} onKeyDown={onKeyDown}>
        <ImageInput
          compact
          value={resolvedValue}
          imageAssets={imageAssets}
          readOnly={readOnly}
          allowLink={false}
          onUpload={onImageUpload}
          onChange={(next) => {
            if (next === null) {
              onValidityChange(path, null);
              updateValue(null);
              return;
            }
            if (!isResolvedImageValue(next)) return;
            const revision = imageAssets?.find((asset) => asset.assetId === next.assetId)?.revision;
            if (!revision) return;
            onValidityChange(path, null);
            updateValue({ assetId: next.assetId, revision });
          }}
        />
      </div>
    );
  }
  if (field.type === "boolean") {
    return (
      <div className="min-w-6">
        <Switch
          checked={value === true}
          disabled={readOnly}
          aria-label={`${field.name} value`}
          onKeyDown={onKeyDown}
          onCheckedChange={(checked) => {
            if (typeof checked !== "boolean") return;
            onValidityChange(path, null);
            updateValue(checked);
          }}
        />
      </div>
    );
  }
  const inputType = typeof field.type === "string" ? propertyInputType(field.type) : null;
  const isEmptyValue =
    value === null || value === undefined || (typeof value === "string" && value.length === 0);

  if (!inputType || readOnly) {
    return (
      <span role="group" tabIndex={0} onKeyDown={onKeyDown} className="max-w-44 truncate text-xs">
        {isEmptyValue ? "(Empty)" : previewValue(value)}
      </span>
    );
  }

  const inputValue: PropertyInputValue | null =
    inputType === "number"
      ? typeof value === "number"
        ? { kind: "number", value }
        : null
      : typeof value === "string"
        ? { kind: inputType, value }
        : null;

  return (
    <div className="h-8" onClick={(event) => event.stopPropagation()}>
      <PropertyInput
        type={inputType}
        value={inputValue}
        icon={variableTypeIcon(field.type)}
        className="h-full"
        allowLink={false}
        placeholder={isEmptyValue ? "(Empty)" : `${field.name} value`}
        onKeyDown={onKeyDown}
        onValidationError={(error) => onValidityChange(path, error)}
        onChange={(next) => {
          const nextValue =
            next !== null && typeof next === "object" && "value" in next ? next.value : null;
          onValidityChange(path, null);
          updateValue(nextValue);
        }}
      />
    </div>
  );
}

function SortableTableRow({
  row,
  readOnly,
}: {
  row: Row<typeof features, ShapeRecord>;
  readOnly: boolean;
}) {
  const { isDragging, isDropTarget, ref, handleRef } = useSortable({
    id: row.original.id,
    index: row.index,
    group: "source-array-records",
    disabled: readOnly,
  });
  return (
    <tr
      ref={ref}
      className={`transition-colors hover:bg-muted/35 ${isDragging ? "opacity-50" : ""} ${isDropTarget ? "ring-2 ring-inset ring-primary" : ""}`}
    >
      <td className="sticky left-0 z-10 bg-background px-2 py-2 shadow-[2px_0_4px_-2px_rgb(0_0_0/0.25)]">
        {!readOnly ? (
          <button
            ref={handleRef}
            type="button"
            aria-label={`Reorder ${previewValue(row.original.fields[Object.keys(row.original.fields)[0] ?? ""])}`}
            aria-roledescription="sortable"
            className="touch-none cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
          >
            <GripVertical className="size-4" />
          </button>
        ) : null}
      </td>
      {row.getAllCells().map((cell) => (
        <td
          key={cell.id}
          data-table-cell={cell.column.id === "open" ? undefined : `${row.index}:${cell.column.id}`}
          style={{ width: cell.column.getSize() }}
          className={`whitespace-nowrap px-3 py-3 ${
            cell.column.id === "open"
              ? "sticky right-0 z-10 bg-background shadow-[-2px_0_4px_-2px_rgb(0_0_0/0.25)]"
              : ""
          }`}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}

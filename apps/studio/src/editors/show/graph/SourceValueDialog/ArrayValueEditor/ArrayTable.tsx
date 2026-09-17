import { defaultPreset, PointerActivationConstraints } from "@dnd-kit/dom";
import type { DragEndEvent } from "@dnd-kit/react";
import { DragDropProvider, PointerSensor } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  ChevronRight,
  GripVertical,
  PropertyInput,
  Switch,
  type PropertyInputValue,
} from "@mechane/design-system";
import { isShapeStructuredValueTemplate, setValueAtPath, type Shape } from "@mechane/domain";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Row,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef } from "react";
import { SourceImagePreview } from "../ValueEditor";

import { propertyInputType, previewValue } from "../../inspector/source-values-helpers";
import type { ErrorPath, SourceImageAsset } from "../../inspector/source-value-types";
import type { ShapeRecord } from "./types";
import { recordIdentifier } from "./types";
const tableSensors = (defaults: typeof defaultPreset.sensors) =>
  defaults.map((sensor) =>
    sensor === PointerSensor
      ? PointerSensor.configure({
          activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
        })
      : sensor,
  );
const columnHelper = createColumnHelper<ShapeRecord>();

export function ArrayTable({
  records,
  fields,
  readOnly,
  imageAssets,
  path,
  onReorder,
  onRecordChange,
  onValidityChange,
  onOpenRecord,
}: {
  records: ShapeRecord[];
  fields: Shape["fields"];
  readOnly: boolean;
  imageAssets?: readonly SourceImageAsset[];
  path: ErrorPath;
  onReorder(sourceId: string, targetId: string): void;
  onRecordChange(record: ShapeRecord): void;
  onValidityChange(path: ErrorPath, error: string | null): void;
  onOpenRecord(id: string): void;
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
  const columns = useMemo(
    () => [
      ...fields.map((field) =>
        columnHelper.accessor((record) => previewValue(record.fields[field.id]), {
          id: field.id,
          header: field.name,
          cell: ({ row }) => (
            <TableValueCell
              field={field}
              value={row.original.fields[field.id]}
              record={row.original}
              readOnly={readOnly}
              imageAssets={imageAssets}
              path={[...pathRef.current, row.original.id, field.id]}
              onRecordChange={(record) => recordChangeRef.current(record)}
              onValidityChange={(nextPath, error) => validityChangeRef.current(nextPath, error)}
            />
          ),
        }),
      ),
      columnHelper.display({
        id: "open",
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
    ],
    [fields, imageAssets, readOnly],
  );
  const table = useReactTable({
    data: records,
    columns,
    getCoreRowModel: getCoreRowModel(),
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
    <div className="min-w-0 overflow-auto rounded-lg border border-border">
      <DragDropProvider sensors={tableSensors} onDragEnd={finishDrag}>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted/45 text-[11px] uppercase tracking-wide text-muted-foreground">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                <th className="w-10 px-3 py-2.5" aria-label={readOnly ? undefined : "Reorder"} />
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="whitespace-nowrap px-3 py-2.5 font-medium">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
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
    </div>
  );
}
function TableValueCell({
  field,
  value,
  record,
  readOnly,
  imageAssets,
  path,
  onRecordChange,
  onValidityChange,
}: {
  field: Shape["fields"][number];
  value: unknown;
  record: ShapeRecord;
  readOnly: boolean;
  imageAssets?: readonly SourceImageAsset[];
  path: ErrorPath;
  onRecordChange(record: ShapeRecord): void;
  onValidityChange(path: ErrorPath, error: string | null): void;
}) {
  const updateValue = (nextValue: unknown) => {
    const updated = setValueAtPath(record, [field.id], nextValue);
    if (isShapeStructuredValueTemplate(updated)) onRecordChange(updated);
  };

  if (field.type === "image") {
    return <SourceImagePreview value={value} imageAssets={imageAssets} className="max-w-44" />;
  }

  if (field.type === "boolean") {
    return (
      <div className="min-w-6" onClick={(event) => event.stopPropagation()}>
        <Switch
          checked={value === true}
          disabled={readOnly}
          aria-label={`${field.name} value`}
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
  if (!inputType || readOnly) {
    return <span className="max-w-44 truncate text-xs">{previewValue(value)}</span>;
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
    <div onClick={(event) => event.stopPropagation()}>
      <PropertyInput
        type={inputType}
        value={inputValue}
        allowLink={false}
        placeholder={`${field.name} value`}
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

function SortableTableRow({ row, readOnly }: { row: Row<ShapeRecord>; readOnly: boolean }) {
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
      <td className="px-2 py-2">
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
      {row.getVisibleCells().map((cell) => (
        <td key={cell.id} className="whitespace-nowrap px-3 py-3">
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}

import { defaultPreset, PointerActivationConstraints } from "@dnd-kit/dom";
import type { DragEndEvent } from "@dnd-kit/react";
import { DragDropProvider, PointerSensor } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { ChevronRight, GripVertical } from "@mechane/design-system";
import type { Shape } from "@mechane/domain";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Row,
} from "@tanstack/react-table";
import { useMemo } from "react";

import { previewValue } from "../inspector/source-values-helpers";
import type { ShapeRecord } from "./types";

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
  selectedId,
  editMode,
  onSelect,
  onReorder,
}: {
  records: ShapeRecord[];
  fields: Shape["fields"];
  selectedId: string;
  editMode: boolean;
  onSelect(id: string): void;
  onReorder(sourceId: string, targetId: string): void;
}) {
  const columns = useMemo(
    () => [
      ...fields.map((field) =>
        columnHelper.accessor((record) => previewValue(record.fields[field.id]), {
          id: field.id,
          header: field.name,
          cell: ({ getValue }) => <span className="max-w-44 truncate text-xs">{getValue<string>()}</span>,
        }),
      ),
      columnHelper.display({
        id: "open",
        header: "",
        cell: () => <ChevronRight className="size-4 text-muted-foreground" />,
      }),
    ],
    [fields],
  );
  const table = useReactTable({
    data: records,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (record) => record.id,
  });
  const finishDrag = (event: DragEndEvent) => {
    if (event.canceled) return;
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
                <th className="w-10 px-3 py-2.5" aria-label="Reorder" />
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
              <SortableTableRow
                key={row.id}
                row={row}
                selectedId={selectedId}
                editMode={editMode}
                onSelect={onSelect}
              />
            ))}
          </tbody>
        </table>
      </DragDropProvider>
      {records.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No records match this filter.</p>
      ) : null}
    </div>
  );
}

function SortableTableRow({
  row,
  selectedId,
  editMode,
  onSelect,
}: {
  row: Row<ShapeRecord>;
  selectedId: string;
  editMode: boolean;
  onSelect(id: string): void;
}) {
  const { isDragging, isDropTarget, ref, handleRef } = useSortable({
    id: row.original.id,
    index: row.index,
    group: "source-array-records",
    disabled: !editMode,
  });
  return (
    <tr
      ref={ref}
      onClick={() => onSelect(row.original.id)}
      className={`cursor-pointer transition-colors ${row.original.id === selectedId ? "bg-primary/[0.07]" : "hover:bg-muted/35"} ${isDragging ? "opacity-50" : ""} ${isDropTarget ? "ring-2 ring-inset ring-primary" : ""}`}
    >
      <td className="px-2 py-2">
        <button
          ref={handleRef}
          type="button"
          aria-label={`Reorder ${previewValue(row.original.fields[Object.keys(row.original.fields)[0] ?? ""])}`}
          aria-roledescription="sortable"
          className="touch-none cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!editMode}
        >
          <GripVertical className="size-4" />
        </button>
      </td>
      {row.getVisibleCells().map((cell) => (
        <td key={cell.id} className="whitespace-nowrap px-3 py-3">
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}

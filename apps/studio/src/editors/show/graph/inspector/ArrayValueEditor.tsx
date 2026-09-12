import {
  Badge,
  Button,
  ChevronRight,
  Download,
  Eye,
  Grid2X2,
  Input,
  List,
  Pencil,
  Plus,
  Search,
  Separator,
  Switch,
  Table2,
  Tabs,
  TabsList,
  TabsTrigger,
  Trash2,
  Upload,
} from "@mechane/design-system";
import {
  defaultValueForType,
  isArrayStructuredValueTemplate,
  isShapeStructuredValueTemplate,
  normalizeStructuredValueTemplate,
  setValueAtPath,
  type Shape,
  type StructuredValueTemplate,
  type Type,
} from "@mechane/domain";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

import { ValueEditor } from "./ValueEditor";
import { previewValue } from "./source-values-helpers";
import type { ErrorPath } from "./source-value-types";

type ShapeRecord = Extract<StructuredValueTemplate, { kind: "shape" }>;
type ArrayType = Extract<Type, { kind: "array" }>;
type ViewMode = "table" | "record";

const columnHelper = createColumnHelper<ShapeRecord>();

export function ArrayValueEditor({
  type,
  value,
  shapes,
  path,
  onChange,
  onValidityChange,
}: {
  type: ArrayType;
  value: unknown;
  shapes: readonly Shape[];
  path: ErrorPath;
  onChange(value: unknown): void;
  onValidityChange(path: ErrorPath, error: string | null): void;
}) {
  const normalized = isArrayStructuredValueTemplate(value) ? value : null;
  if (!isArrayStructuredValueTemplate(normalized)) {
    return <p className="text-sm text-destructive">This array value could not be opened.</p>;
  }
  const itemType = type.of;
  if (typeof itemType === "string" || itemType.kind !== "shape") {
    return <p className="text-sm text-muted-foreground">Use the standard value editor for this array.</p>;
  }

  const shape = shapes.find((candidate) => candidate.id === itemType.shapeId);
  const records = normalized.items.filter(isShapeStructuredValueTemplate);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [editMode, setEditMode] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? "");

  useEffect(() => {
    if (!records.some((record) => record.id === selectedId)) {
      setSelectedId(records[0]?.id ?? "");
    }
  }, [records, selectedId]);

  if (!shape) {
    return <p className="text-sm text-destructive">The array item shape is unavailable.</p>;
  }

  const visibleRecords = query.trim()
    ? records.filter((record) =>
        [record.id, ...shape.fields.map((field) => previewValue(record.fields[field.id]))].some(
          (fieldValue) => fieldValue.toLowerCase().includes(query.trim().toLowerCase()),
        ),
      )
    : records;
  const selectedRecord = records.find((record) => record.id === selectedId) ?? records[0] ?? null;

  const updateArray = (items: readonly StructuredValueTemplate[]) => {
    onChange({ ...normalized, items });
  };

  const selectedIndex = records.findIndex((record) => record.id === selectedId);
  const updateRecord = (nextRecord: ShapeRecord) => {
    updateArray(
      normalized.items.map((item) =>
        isShapeStructuredValueTemplate(item) && item.id === nextRecord.id ? nextRecord : item,
      ),
    );
  };

  const addRecord = () => {
    if (!editMode) return;
    const next = normalizeStructuredValueTemplate(defaultValueForType(itemType, shapes), itemType, shapes);
    if (!isShapeStructuredValueTemplate(next)) return;
    updateArray([...normalized.items, next]);
    setSelectedId(next.id);
    setViewMode("record");
  };

  const removeRecord = () => {
    if (!editMode || !selectedRecord) return;
    const nextRecords = records.filter((record) => record.id !== selectedRecord.id);
    updateArray(nextRecords);
    setSelectedId(nextRecords[0]?.id ?? "");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Table2 className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">items</span>
              <Badge variant="outline">{records.length} records</Badge>
              <Badge variant="secondary">{shape.name}</Badge>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <span>source value</span>
              <ChevronRight className="size-3" />
              <span className="font-mono">array&lt;{shape.name}&gt;</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" disabled title="Import is a placeholder">
            <Upload /> Import
          </Button>
          <Button variant="ghost" size="sm" disabled title="Export is a placeholder">
            <Download /> Export
          </Button>
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
            {editMode ? <Pencil className="size-3.5 text-primary" /> : <Eye className="size-3.5 text-muted-foreground" />}
            <span className="text-xs font-medium">{editMode ? "Edit" : "Read only"}</span>
            <Switch size="sm" checked={editMode} onCheckedChange={setEditMode} aria-label={editMode ? "Edit mode" : "Read only"} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter records" className="h-8 pl-8 text-xs" />
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value === "record" ? "record" : "table")}>
            <TabsList className="h-8">
              <TabsTrigger value="table" className="h-7 px-2.5"><Table2 /> Table</TabsTrigger>
              <TabsTrigger value="record" className="h-7 px-2.5"><List /> Record</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" onClick={addRecord} disabled={!editMode}><Plus /> Add record</Button>
        </div>
      </div>

      {viewMode === "table" ? (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <ArrayTable
            records={visibleRecords}
            fields={shape.fields}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <RecordDetails
            record={selectedRecord}
            recordIndex={selectedIndex < 0 ? 0 : selectedIndex}
            fields={shape.fields}
            shapes={shapes}
            path={path}
            editMode={editMode}
            onChange={updateRecord}
            onValidityChange={onValidityChange}
            onRemove={removeRecord}
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <RecordRail records={visibleRecords} selectedId={selectedId} onSelect={setSelectedId} onAdd={addRecord} editMode={editMode} />
          <RecordDetails
            record={selectedRecord}
            recordIndex={selectedIndex < 0 ? 0 : selectedIndex}
            fields={shape.fields}
            shapes={shapes}
            path={path}
            editMode={editMode}
            onChange={updateRecord}
            onValidityChange={onValidityChange}
            onRemove={removeRecord}
            spacious
          />
        </div>
      )}
    </div>
  );
}

function ArrayTable({ records, fields, selectedId, onSelect }: { records: ShapeRecord[]; fields: Shape["fields"]; selectedId: string; onSelect(id: string): void }) {
  const columns = useMemo(
    () => [
      columnHelper.display({ id: "index", header: "", cell: ({ row }) => <span className="font-mono text-[10px] text-muted-foreground">{String(row.index + 1).padStart(2, "0")}</span> }),
      ...fields.map((field) =>
        columnHelper.accessor((record) => previewValue(record.fields[field.id]), {
          id: field.id,
          header: field.name,
          cell: ({ getValue }) => <span className="max-w-44 truncate text-xs">{getValue<string>()}</span>,
        }),
      ),
      columnHelper.display({ id: "open", header: "", cell: () => <ChevronRight className="size-4 text-muted-foreground" /> }),
    ],
    [fields],
  );
  const table = useReactTable({ data: records, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="min-w-0 overflow-auto rounded-lg border border-border">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-muted/45 text-[11px] uppercase tracking-wide text-muted-foreground">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="whitespace-nowrap px-3 py-2.5 font-medium">{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-border">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} onClick={() => onSelect(row.original.id)} className={`cursor-pointer transition-colors ${row.original.id === selectedId ? "bg-primary/[0.07]" : "hover:bg-muted/35"}`}>
              {row.getVisibleCells().map((cell) => <td key={cell.id} className="whitespace-nowrap px-3 py-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {records.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No records match this filter.</p> : null}
    </div>
  );
}

function RecordRail({ records, selectedId, onSelect, onAdd, editMode }: { records: ShapeRecord[]; selectedId: string; onSelect(id: string): void; onAdd(): void; editMode: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/15 p-2">
      <div className="mb-2 flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground"><Grid2X2 className="size-3.5" /> Records</div>
      <div className="space-y-1">
        {records.map((record, index) => (
          <button type="button" key={record.id} onClick={() => onSelect(record.id)} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left ${record.id === selectedId ? "bg-primary/10 text-foreground ring-1 ring-primary/20" : "hover:bg-muted"}`}>
            <span className="font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{previewValue(record.fields[Object.keys(record.fields)[0] ?? ""])}</span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </button>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="mt-2 w-full border border-dashed border-border" onClick={onAdd} disabled={!editMode}><Plus /> Add</Button>
    </div>
  );
}

function RecordDetails({ record, recordIndex, fields, shapes, path, editMode, onChange, onValidityChange, onRemove, spacious = false }: { record: ShapeRecord | null; recordIndex: number; fields: Shape["fields"]; shapes: readonly Shape[]; path: ErrorPath; editMode: boolean; onChange(record: ShapeRecord): void; onValidityChange(path: ErrorPath, error: string | null): void; onRemove(): void; spacious?: boolean }) {
  if (!record) return <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No record selected.</div>;

  return (
    <div className={`min-w-0 overflow-auto rounded-lg border border-border bg-background p-4 ${spacious ? "sm:p-6" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="label">Record detail</p><h3 className="mt-1 text-base font-semibold">Item</h3><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{record.id}</p></div>
        <Button variant="ghost" size="icon-sm" onClick={onRemove} disabled={!editMode} aria-label="Remove record"><Trash2 /></Button>
      </div>
      <Separator className="my-4" />
      <div className="space-y-4">
        {fields.map((field) => {
          const fieldValue = record.fields[field.id];
          return (
            <div key={field.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{field.name}</span><span className="text-[10px] text-muted-foreground">{typeof field.type === "string" ? field.type : field.type.kind === "shape" ? "object" : "array"}</span></div>
              {editMode ? (
                <ValueEditor
                  type={field.type}
                  value={fieldValue}
                  shapes={shapes}
                  path={[...path, recordIndex, field.id]}
                  onChange={(next) => {
                    const updated = setValueAtPath(record, [field.id], next);
                    if (isShapeStructuredValueTemplate(updated)) onChange(updated);
                  }}
                  onValidityChange={onValidityChange}
                />
              ) : (
                <div className="rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">{previewValue(fieldValue)}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


import {
  Badge,
  Button,
  ChevronRight,
  DownloadIcon,
  EyeIcon,
  ListIcon,
  PencilIcon,
  PlusIcon,
  SearchInput,
  Separator,
  Switch,
  Table2Icon,
  Tabs,
  TabsList,
  TabsTrigger,
  UploadIcon,
} from "@mechane/design-system";
import {
  defaultValueForType,
  isArrayStructuredValueTemplate,
  isShapeStructuredValueTemplate,
  normalizeStructuredValueTemplate,
  type StructuredValueTemplate,
} from "@mechane/domain";
import { useEffect, useState } from "react";

import { previewValue } from "../inspector/source-values-helpers";
import { ArrayTable } from "./ArrayTable";
import { RecordDetails } from "./RecordDetails";
import { RecordRail } from "./RecordRail";
import type { ArrayValueEditorProps, ViewMode, ShapeRecord } from "./types";
import { recordIdentifier } from "./types";

export function ArrayValueEditor({
  type,
  value,
  shapes,
  path,
  focus,
  onChange,
  onValidityChange,
  onSelectionChange,
}: ArrayValueEditorProps) {
  const normalized = isArrayStructuredValueTemplate(value) ? value : null;
  const itemType = type.of;
  const canEditArray =
    normalized !== null && typeof itemType !== "string" && itemType.kind === "shape";
  const shape = canEditArray
    ? shapes.find((candidate) => candidate.id === itemType.shapeId)
    : undefined;
  const records = normalized?.items.filter(isShapeStructuredValueTemplate) ?? [];
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [editMode, setEditMode] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (focus?.kind === "array") {
      setSelectedId("");
      setViewMode("table");
      return;
    }
    if (focus?.kind === "record" && records.some((record) => record.id === focus.id)) {
      setSelectedId(focus.id);
    }
  }, [focus, records]);

  useEffect(() => {
    if (selectedId && !records.some((record) => record.id === selectedId)) {
      setSelectedId("");
    }
  }, [records, selectedId]);

  if (normalized === null) {
    return <p className="text-sm text-destructive">This array value could not be opened.</p>;
  }
  if (!canEditArray) {
    return (
      <p className="text-sm text-muted-foreground">Use the standard value editor for this array.</p>
    );
  }
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
  const selectedRecord = selectedId
    ? (records.find((record) => record.id === selectedId) ?? null)
    : null;
  const reportSelection = (record: ShapeRecord | null) => {
    onSelectionChange?.(
      record ? { id: record.id, label: recordIdentifier(record, shape.fields) } : null,
    );
  };
  const selectRecord = (id: string) => {
    const record = records.find((candidate) => candidate.id === id);
    if (!record) return;
    setSelectedId(id);
    reportSelection(record);
  };

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

  const reorderRecords = (sourceId: string, targetId: string) => {
    if (!editMode || sourceId === targetId) return;
    const sourceIndex = normalized.items.findIndex(
      (item) => isShapeStructuredValueTemplate(item) && item.id === sourceId,
    );
    const targetIndex = normalized.items.findIndex(
      (item) => isShapeStructuredValueTemplate(item) && item.id === targetId,
    );
    if (sourceIndex < 0 || targetIndex < 0) return;
    const items = [...normalized.items];
    const [moved] = items.splice(sourceIndex, 1);
    if (!moved) return;
    items.splice(targetIndex, 0, moved);
    updateArray(items);
  };

  const addRecord = () => {
    if (!editMode) return;
    const next = normalizeStructuredValueTemplate(
      defaultValueForType(itemType, shapes),
      itemType,
      shapes,
    );
    if (!isShapeStructuredValueTemplate(next)) return;
    updateArray([...normalized.items, next]);
    setSelectedId(next.id);
    reportSelection(next);
    setViewMode("record");
  };

  const removeRecord = () => {
    if (!editMode || !selectedRecord) return;
    const nextRecords = records.filter((record) => record.id !== selectedRecord.id);
    updateArray(nextRecords);
    setSelectedId(nextRecords[0]?.id ?? "");
    reportSelection(nextRecords[0] ?? null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Table2Icon className="size-4" />
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
              <span className="font-mono">Array of {shape.name}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" disabled title="Import is a placeholder">
            <UploadIcon /> Import
          </Button>
          <Button variant="ghost" size="sm" disabled title="Export is a placeholder">
            <DownloadIcon /> Export
          </Button>
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
            {editMode ? (
              <PencilIcon className="size-3.5 text-primary" />
            ) : (
              <EyeIcon className="size-3.5 text-muted-foreground" />
            )}
            <span className="text-xs font-medium">{editMode ? "Edit" : "Read only"}</span>
            <Switch
              size="sm"
              checked={editMode}
              onCheckedChange={setEditMode}
              aria-label={editMode ? "Edit mode" : "Read only"}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          className="h-8! max-h-8"
          placeholder="Filter…"
          value={query}
          onValueChange={setQuery}
        />
        <div className="flex items-center gap-2">
          <Tabs
            value={viewMode}
            onValueChange={(value) => setViewMode(value === "record" ? "record" : "table")}
          >
            <TabsList className="h-8">
              <TabsTrigger value="table">
                <Table2Icon /> Table
              </TabsTrigger>
              <TabsTrigger value="record">
                <ListIcon /> Record
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" onClick={addRecord} disabled={!editMode}>
            <PlusIcon /> Add record
          </Button>
        </div>
      </div>
      {viewMode === "table" ? (
        <div
          className={
            selectedRecord
              ? "grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]"
              : "min-h-0 flex-1"
          }
        >
          <ArrayTable
            records={visibleRecords}
            fields={shape.fields}
            selectedId={selectedId}
            editMode={editMode}
            onSelect={selectRecord}
            onReorder={reorderRecords}
          />
          {selectedRecord ? (
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
          ) : null}
        </div>
      ) : (
        <div
          className={
            selectedRecord
              ? "grid min-h-0 flex-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]"
              : "min-h-0 flex-1"
          }
        >
          <RecordRail
            records={visibleRecords}
            selectedId={selectedId}
            fields={shape.fields}
            onSelect={selectRecord}
            onAdd={addRecord}
            editMode={editMode}
          />
          {selectedRecord ? (
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
          ) : null}
        </div>
      )}
    </div>
  );
}

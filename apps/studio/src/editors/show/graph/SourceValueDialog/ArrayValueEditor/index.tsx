import {
  Badge,
  Button,
  ChevronRight,
  DownloadIcon,
  ListIcon,
  PlusIcon,
  SearchInput,
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
  type Shape,
  type StructuredValueTemplate,
} from "@mechane/domain";
import { useMemo, useState } from "react";
import { previewValue } from "../../inspector/source-values-helpers";
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
  readOnly,
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
  const normalizedItems = normalized?.items;
  const records = useMemo(
    () => normalizedItems?.filter(isShapeStructuredValueTemplate) ?? [],
    [normalizedItems],
  );
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [query, setQuery] = useState("");
  const selectedId = focus?.kind === "record" ? focus.id : "";
  const displayedViewMode = focus?.kind === "array" ? "table" : viewMode;

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
    onSelectionChange(
      record ? { id: record.id, label: recordIdentifier(record, shape.fields) } : null,
    );
  };
  const selectRecord = (id: string) => {
    const record = records.find((candidate) => candidate.id === id);
    if (!record) return;
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
    if (readOnly || sourceId === targetId) return;
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
    if (readOnly) return;
    const next = normalizeStructuredValueTemplate(
      defaultValueForType(itemType, shapes),
      itemType,
      shapes,
    );
    if (!isShapeStructuredValueTemplate(next)) return;
    updateArray([...normalized.items, next]);
    reportSelection(next);
    setViewMode("record");
  };

  const removeRecord = () => {
    if (readOnly || !selectedRecord) return;
    const nextRecords = records.filter((record) => record.id !== selectedRecord.id);
    updateArray(nextRecords);
    reportSelection(nextRecords[0] ?? null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ArrayEditorToolbar
        recordsCount={records.length}
        shapeName={shape.name}
        readOnly={readOnly}
        query={query}
        setQuery={setQuery}
        viewMode={displayedViewMode}
        setViewMode={setViewMode}
        addRecord={addRecord}
      />
      <ArrayEditorRecords
        viewMode={displayedViewMode}
        selectedRecord={selectedRecord}
        visibleRecords={visibleRecords}
        shape={shape}
        selectedId={selectedId}
        readOnly={readOnly}
        selectRecord={selectRecord}
        reorderRecords={reorderRecords}
        selectedIndex={selectedIndex}
        shapes={shapes}
        path={path}
        updateRecord={updateRecord}
        onValidityChange={onValidityChange}
        removeRecord={removeRecord}
        addRecord={addRecord}
      />
    </div>
  );
}
type ArrayEditorToolbarProps = {
  recordsCount: number;
  shapeName: string;
  readOnly: boolean;
  query: string;
  setQuery(value: string): void;
  viewMode: ViewMode;
  setViewMode(value: ViewMode): void;
  addRecord(): void;
};

function ArrayEditorToolbar({
  recordsCount,
  shapeName,
  readOnly,
  query,
  setQuery,
  viewMode,
  setViewMode,
  addRecord,
}: ArrayEditorToolbarProps) {
  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Table2Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">items</span>
              <Badge variant="outline">{recordsCount} records</Badge>
              <Badge variant="secondary">{shapeName}</Badge>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <span>source value</span>
              <ChevronRight className="size-3" />
              <span className="font-mono">Array of {shapeName}</span>
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
          <Button size="sm" onClick={addRecord} disabled={readOnly}>
            <PlusIcon /> Add record
          </Button>
        </div>
      </div>
    </>
  );
}

type ArrayEditorRecordsProps = {
  viewMode: ViewMode;
  selectedRecord: ShapeRecord | null;
  visibleRecords: ShapeRecord[];
  shape: Shape;
  selectedId: string;
  readOnly: boolean;
  selectRecord(id: string): void;
  reorderRecords(sourceId: string, targetId: string): void;
  selectedIndex: number;
  shapes: readonly Shape[];
  path: ArrayValueEditorProps["path"];
  updateRecord(record: ShapeRecord): void;
  onValidityChange: ArrayValueEditorProps["onValidityChange"];
  removeRecord(): void;
  addRecord(): void;
};

function ArrayEditorRecords({
  viewMode,
  selectedRecord,
  visibleRecords,
  shape,
  selectedId,
  readOnly,
  selectRecord,
  reorderRecords,
  selectedIndex,
  shapes,
  path,
  updateRecord,
  onValidityChange,
  removeRecord,
  addRecord,
}: ArrayEditorRecordsProps) {
  if (viewMode === "table") {
    return (
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
          readOnly={readOnly}
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
            readOnly={readOnly}
            onChange={updateRecord}
            onValidityChange={onValidityChange}
            onRemove={removeRecord}
          />
        ) : null}
      </div>
    );
  }

  return (
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
        readOnly={readOnly}
      />
      {selectedRecord ? (
        <RecordDetails
          record={selectedRecord}
          recordIndex={selectedIndex < 0 ? 0 : selectedIndex}
          fields={shape.fields}
          shapes={shapes}
          path={path}
          readOnly={readOnly}
          onChange={updateRecord}
          onValidityChange={onValidityChange}
          onRemove={removeRecord}
          spacious
        />
      ) : null}
    </div>
  );
}

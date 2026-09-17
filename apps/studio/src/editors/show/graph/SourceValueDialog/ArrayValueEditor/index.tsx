import {
  Badge,
  Button,
  ChevronLeft,
  ChevronRight,
  DownloadIcon,
  ListIcon,
  PlusIcon,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import type { ArrayValueEditorProps, ShapeRecord, ViewMode } from "./types";
import { recordIdentifier } from "./types";

export function ArrayValueEditor({
  type,
  value,
  shapes,
  path,
  focus,
  readOnly,
  columnSizes,
  onColumnSizesChange,
  imageAssets,
  onImageUpload,
  onChange,
  onImmediateChange,
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
  const [recordId, setRecordId] = useState<string | null>(() =>
    focus.kind === "record" ? focus.id : null,
  );

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
  const activeRecordId =
    focus.kind === "record"
      ? focus.id
      : records.some((record) => record.id === recordId)
        ? recordId
        : (records[0]?.id ?? null);
  const activeRecord = activeRecordId
    ? (records.find((record) => record.id === activeRecordId) ?? null)
    : null;
  const activeIndex = activeRecordId
    ? records.findIndex((record) => record.id === activeRecordId)
    : -1;

  const reportSelection = (record: ShapeRecord | null) => {
    onSelectionChange(
      record ? { id: record.id, label: recordIdentifier(record, shape.fields, imageAssets) } : null,
    );
  };
  const openRecord = (id: string) => {
    const record = records.find((candidate) => candidate.id === id);
    if (!record) return;
    setRecordId(id);
    setViewMode("record");
    reportSelection(record);
  };
  const changeViewMode = (next: ViewMode) => {
    setViewMode(next);
    if (next === "record") {
      const record = activeRecord ?? records[0] ?? null;
      setRecordId(record?.id ?? null);
      reportSelection(record);
    } else {
      setRecordId(null);
      reportSelection(null);
    }
  };
  const updateArray = (items: readonly StructuredValueTemplate[]) => {
    const next = { ...normalized, items };
    onChange(next);
    onImmediateChange?.(next);
  };
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
  const createRecord = (): string | null => {
    if (readOnly) return null;
    const next = normalizeStructuredValueTemplate(
      defaultValueForType(itemType, shapes),
      itemType,
      shapes,
    );
    if (!isShapeStructuredValueTemplate(next)) return null;
    updateArray([...normalized.items, next]);
    return next.id;
  };
  const addRecord = () => {
    const id = createRecord();
    if (id) openRecord(id);
  };
  const addRecordFromTable = () => {
    const id = createRecord();
    if (id) {
      changeViewMode("table");
      setRecordId(null);
    }
    return id;
  };
  const removeRecord = () => {
    if (readOnly || !activeRecord) return;
    const nextRecords = records.filter((record) => record.id !== activeRecord.id);
    updateArray(nextRecords);
    const nextRecord = nextRecords[Math.min(activeIndex, nextRecords.length - 1)] ?? null;
    if (nextRecord) {
      setRecordId(nextRecord.id);
      reportSelection(nextRecord);
    } else {
      changeViewMode("table");
    }
  };
  const selectAdjacentRecord = (offset: number) => {
    const nextRecord = records[activeIndex + offset];
    if (nextRecord) openRecord(nextRecord.id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ArrayEditorToolbar
        recordsCount={records.length}
        shapeName={shape.name}
        readOnly={readOnly}
        query={query}
        setQuery={setQuery}
        viewMode={viewMode}
        setViewMode={changeViewMode}
        addRecord={addRecord}
        recordIndex={activeIndex}
        recordId={activeRecordId}
        recordLabel={activeRecord ? recordIdentifier(activeRecord, shape.fields, imageAssets) : ""}
        onRecordSelect={openRecord}
        records={records}
        fields={shape.fields}
        imageAssets={imageAssets}
        onPrevious={() => selectAdjacentRecord(-1)}
        onNext={() => selectAdjacentRecord(1)}
      />
      {viewMode === "table" ? (
        <ArrayTable
          columnSizes={columnSizes}
          onColumnSizesChange={onColumnSizesChange}
          records={visibleRecords}
          fields={shape.fields}
          readOnly={readOnly}
          path={path}
          onRecordChange={updateRecord}
          onValidityChange={onValidityChange}
          onImageUpload={onImageUpload}
          imageAssets={imageAssets}
          onOpenRecord={openRecord}
          onCreateRecord={addRecordFromTable}
          onReorder={reorderRecords}
        />
      ) : (
        <RecordDetails
          record={activeRecord}
          recordIndex={activeIndex < 0 ? 0 : activeIndex}
          fields={shape.fields}
          shapes={shapes}
          path={path}
          readOnly={readOnly}
          imageAssets={imageAssets}
          onImageUpload={onImageUpload}
          onChange={updateRecord}
          onValidityChange={onValidityChange}
          onRemove={removeRecord}
          spacious
        />
      )}
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
  recordIndex: number;
  recordLabel: string;
  recordId: string | null;
  records: readonly ShapeRecord[];
  fields: Shape["fields"];
  imageAssets?: ArrayValueEditorProps["imageAssets"];
  onRecordSelect(id: string): void;
  onPrevious(): void;
  onNext(): void;
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
  recordLabel,
  fields,
  imageAssets,
  recordIndex,
  recordId,
  records,
  onRecordSelect,
  onPrevious,
  onNext,
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
        <div className="flex flex-wrap items-center gap-2">
          {viewMode === "record" ? (
            <>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Previous record"
                disabled={recordIndex <= 0}
                onClick={onPrevious}
              >
                <ChevronLeft />
              </Button>
              <Select
                value={recordId ?? ""}
                onValueChange={(value) => {
                  if (value) onRecordSelect(value);
                }}
              >
                <SelectTrigger className="w-44" aria-label="Choose record">
                  <SelectValue placeholder="Choose record">{recordLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {records.map((record, index) => (
                    <SelectItem key={record.id} value={record.id}>
                      {String(index + 1).padStart(2, "0")}{" "}
                      {recordIdentifier(record, fields, imageAssets)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Next record"
                disabled={recordIndex < 0 || recordIndex >= records.length - 1}
                onClick={onNext}
              >
                <ChevronRight />
              </Button>
            </>
          ) : null}
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

import type { ImageInputOnUploadProps } from "@mechane/design-system";
import { generateId } from "@mechane/domain/id";
import { typeLabel, type PrimitiveType, type ShapeField } from "@mechane/domain/shapes";
import { defaultValueForType } from "@mechane/domain/source-defaults";
import {
  isArrayStructuredValueTemplate,
  normalizeStructuredValueTemplate,
  type StructuredValueTemplate,
} from "@mechane/domain/structured-values";
import { useMemo, useState } from "react";

import type { ErrorPath, SourceImageAsset } from "../../inspector/source-value-types";
import { previewValue } from "../../inspector/source-values-helpers";
import { ArrayEditorToolbar } from "./ArrayEditorToolbar";
import { ArrayTable } from "./ArrayTable";
import type { ShapeRecord } from "./types";

/** The single table column; each row's item lives under this key. */
const ITEM_FIELD_ID = "value";
const NO_ITEMS: readonly StructuredValueTemplate[] = [];

/**
 * Primitive items carry no identity of their own, but the table keys rows,
 * drag targets, and exit animations by id. Each item is therefore wrapped in a
 * one-field row whose id lives only as long as this editor.
 */
function itemRow(item: StructuredValueTemplate, id = generateId("structuredValue")): ShapeRecord {
  return { id, kind: "shape", fields: { [ITEM_FIELD_ID]: item } };
}

function rowItem(row: ShapeRecord): StructuredValueTemplate {
  return row.fields[ITEM_FIELD_ID] ?? null;
}

/** Positional reconciliation for items replaced from outside the table. */
function rowsForItems(
  rows: readonly ShapeRecord[],
  items: readonly StructuredValueTemplate[],
): ShapeRecord[] {
  return items.map((item, index) => {
    const row = rows[index];
    if (!row) return itemRow(item);
    return rowItem(row) === item ? row : itemRow(item, row.id);
  });
}

type PrimitiveArrayEditorProps = {
  itemType: PrimitiveType;
  value: unknown;
  path: ErrorPath;
  readOnly: boolean;
  columnSizes?: Record<string, number>;
  onColumnSizesChange?(columnSizes: Record<string, number>): void;
  imageAssets?: readonly SourceImageAsset[];
  onImageUpload?: (props: ImageInputOnUploadProps) => void;
  onChange(value: unknown): void;
  onImmediateChange?(value: unknown): void;
  onValidityChange(path: ErrorPath, error: string | null): void;
};

/**
 * Edits an array of primitives as a one-column table. There is no record view:
 * a primitive item has nothing more to show than its table cell.
 */
export function PrimitiveArrayEditor({
  itemType,
  value,
  path,
  readOnly,
  columnSizes,
  onColumnSizesChange,
  imageAssets,
  onImageUpload,
  onChange,
  onImmediateChange,
  onValidityChange,
}: PrimitiveArrayEditorProps) {
  const normalized = isArrayStructuredValueTemplate(value) ? value : null;
  const items = normalized?.items ?? NO_ITEMS;
  const [rows, setRows] = useState(() => rowsForItems([], items));
  // Edits made here update `rows` and the value together. Anything else that
  // replaces the value is adopted during render, keeping ids where it can.
  if (rows.length !== items.length || rows.some((row, index) => rowItem(row) !== items[index])) {
    setRows(rowsForItems(rows, items));
  }

  const [query, setQuery] = useState("");
  const fields = useMemo<ShapeField[]>(
    () => [
      {
        id: ITEM_FIELD_ID,
        name: typeLabel(itemType),
        type: itemType,
        required: true,
        defaultValue: null,
      },
    ],
    [itemType],
  );
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => previewValue(rowItem(row)).toLowerCase().includes(needle));
  }, [query, rows]);

  if (normalized === null) {
    return <p className="text-sm text-destructive">This array value could not be opened.</p>;
  }

  const commitRows = (nextRows: ShapeRecord[]) => {
    setRows(nextRows);
    const next = { ...normalized, items: nextRows.map(rowItem) };
    onChange(next);
    onImmediateChange?.(next);
  };
  const deleteRow = (id: string) => {
    if (readOnly) return;
    commitRows(rows.filter((row) => row.id !== id));
  };
  const reorderRows = (sourceId: string, targetId: string) => {
    if (readOnly || sourceId === targetId) return;
    const sourceIndex = rows.findIndex((row) => row.id === sourceId);
    const targetIndex = rows.findIndex((row) => row.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const nextRows = [...rows];
    const [moved] = nextRows.splice(sourceIndex, 1);
    if (!moved) return;
    nextRows.splice(targetIndex, 0, moved);
    commitRows(nextRows);
  };
  const addRow = (): string | null => {
    if (readOnly) return null;
    const row = itemRow(normalizeStructuredValueTemplate(defaultValueForType(itemType), itemType));
    commitRows([...rows, row]);
    return row.id;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ArrayEditorToolbar
        noun="item"
        count={rows.length}
        readOnly={readOnly}
        query={query}
        setQuery={setQuery}
        onAdd={addRow}
      />
      <ArrayTable
        model={{
          columnSizes,
          onColumnSizesChange,
          records: visibleRows,
          fields,
          noun: "item",
          readOnly,
          path,
          onRecordChange: (nextRow) =>
            commitRows(rows.map((row) => (row.id === nextRow.id ? nextRow : row))),
          onValidityChange,
          onImageUpload,
          imageAssets,
          onDeleteRecord: deleteRow,
          onCreateRecord: query.trim() ? undefined : addRow,
          onReorder: reorderRows,
        }}
      />
    </div>
  );
}

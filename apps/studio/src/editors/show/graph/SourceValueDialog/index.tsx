import { useState } from "react";

import type { ImageInputOnUploadProps } from "@mechane/design-system";
import type { ImageAssetReference, ResolvedImageValue, Shape, Type } from "@mechane/domain";
import {
  formatValuePath,
  isArrayStructuredValueTemplate,
  isShapeStructuredValueTemplate,
  normalizeStructuredValueTemplate,
} from "@mechane/domain";
import type { SourceValueRow } from "../inspector/source-value-types";
import { INLINE_STRING_LIMIT, sourceValuesEqual } from "../inspector/source-values-helpers";
import {
  recordIdentifier,
  type ArrayValueFocus,
  type ArrayValueSelection,
} from "./ArrayValueEditor/types";
import { SourceValueView } from "./SourceValueView";

type ShapeArrayType = { kind: "array"; of: { kind: "shape"; shapeId: string } };

function isShapeArrayType(type: Type): type is ShapeArrayType {
  return (
    typeof type !== "string" &&
    type.kind === "array" &&
    typeof type.of !== "string" &&
    type.of.kind === "shape"
  );
}
function draftForRow(row: SourceValueRow, shapes: readonly Shape[]) {
  return isShapeArrayType(row.type)
    ? normalizeStructuredValueTemplate(row.value, row.type, shapes)
    : row.value;
}

function arraySelectionForValue(
  value: unknown,
  type: ShapeArrayType | null,
  shapes: readonly Shape[],
  recordId?: string,
): ArrayValueSelection | null {
  if (!type) return null;
  const normalized = isArrayStructuredValueTemplate(value) ? value : null;
  const shape = shapes.find((candidate) => candidate.id === type.of.shapeId);
  const records = normalized?.items.filter(isShapeStructuredValueTemplate) ?? [];
  const record = recordId ? records.find((candidate) => candidate.id === recordId) : records[0];
  if (!shape || !record) return null;
  return { id: record.id, label: recordIdentifier(record, shape.fields) };
}

export function SourceValueDialog({
  nodeName,
  row,
  shapes,
  imageAssets,
  onImageUpload,
  columnSizes,
  onColumnSizesChange,
  open,
  onOpenChange,
  onSave,
  onImmediateChange,
  onClear,
  readOnly = false,
}: {
  nodeName: string;
  row: SourceValueRow;
  shapes: readonly Shape[];
  imageAssets?: readonly (ResolvedImageValue & Pick<ImageAssetReference, "revision">)[];
  onImageUpload?: (props: ImageInputOnUploadProps) => void;
  columnSizes?: Record<string, number>;
  onColumnSizesChange?: (columnSizes: Record<string, number>) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: unknown) => string | null;
  onImmediateChange?: (value: unknown) => void;
  onClear?: () => void;
  readOnly?: boolean;
}) {
  const isLongText =
    typeof row.type === "string" &&
    typeof row.value === "string" &&
    (row.value.includes("\n") || row.value.length > INLINE_STRING_LIMIT);
  const shapeArrayType = isShapeArrayType(row.type) ? row.type : null;
  const initialDraft = draftForRow(row, shapes);
  const [draft, setDraft] = useState(initialDraft);
  const [savedDraft, setSavedDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [arrayFocus, setArrayFocus] = useState<ArrayValueFocus>({ kind: "array" });
  const [pendingFocus, setPendingFocus] = useState<ArrayValueFocus | null>(null);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const isDirty = !sourceValuesEqual(draft, savedDraft);
  const selectedRecord =
    arrayFocus.kind === "record"
      ? arraySelectionForValue(draft, shapeArrayType, shapes, arrayFocus.id)
      : null;

  const updateDraft = (next: unknown) => {
    setErrors(new Map());
    setDraft(next);
  };

  const commitImmediate = (next: unknown) => {
    onImmediateChange?.(next);
    if (onImmediateChange) setSavedDraft(next);
  };

  const updateErrors = (path: readonly (string | number)[], error: string | null) => {
    setErrors((current) => {
      const next = new Map(current);
      const key = formatValuePath(path.map(String));
      if (error) next.set(key, error);
      else next.delete(key);
      return next;
    });
  };

  const applyFocus = (focus: ArrayValueFocus) => {
    setArrayFocus(focus);
  };

  const requestFocus = (focus: ArrayValueFocus) => {
    if (
      (focus.kind === "array" && arrayFocus.kind === "array") ||
      (focus.kind === "record" && arrayFocus.kind === "record" && arrayFocus.id === focus.id)
    ) {
      return;
    }
    if (isDirty) {
      setNavigationError(null);
      setPendingFocus(focus);
      return;
    }
    applyFocus(focus);
  };

  const saveDraft = () => {
    if (!isDirty) return true;
    const conflict = onSave(draft);
    if (conflict) {
      setErrors(new Map([["conflict", conflict]]));
      setNavigationError(conflict);
      return false;
    }
    setSavedDraft(draft);
    return true;
  };

  const breadcrumbs = [
    { label: nodeName, focus: { kind: "array" } as const },
    ...(row.fieldPath.length > 0
      ? [{ label: row.label, focus: shapeArrayType ? ({ kind: "array" } as const) : null }]
      : []),
    ...(selectedRecord && shapeArrayType
      ? [{ label: selectedRecord.label, focus: { kind: "record", id: selectedRecord.id } as const }]
      : []),
  ];

  return (
    <SourceValueView
      row={row}
      shapeArrayType={shapeArrayType}
      breadcrumbs={breadcrumbs}
      open={open}
      onOpenChange={onOpenChange}
      draft={draft}
      shapes={shapes}
      arrayFocus={arrayFocus}
      isLongText={isLongText}
      onImmediateChange={commitImmediate}
      imageAssets={imageAssets}
      columnSizes={columnSizes}
      onColumnSizesChange={onColumnSizesChange}
      onImageUpload={onImageUpload}
      errors={errors}
      onClear={onClear}
      readOnly={readOnly}
      pendingFocus={pendingFocus}
      navigationError={navigationError}
      updateDraft={updateDraft}
      updateErrors={updateErrors}
      requestFocus={requestFocus}
      onSelectionChange={(selection) => {
        setArrayFocus(selection ? { kind: "record", id: selection.id } : { kind: "array" });
      }}
      saveDraft={saveDraft}
      onCancelNavigation={() => {
        setPendingFocus(null);
        setNavigationError(null);
      }}
      onDiscardNavigation={() => {
        if (!pendingFocus) return;
        setDraft(savedDraft);
        setErrors(new Map());
        setPendingFocus(null);
        setNavigationError(null);
        applyFocus(pendingFocus);
      }}
      onSaveNavigation={() => {
        const nextFocus = pendingFocus;
        if (!nextFocus || !saveDraft()) return;
        setPendingFocus(null);
        setNavigationError(null);
        applyFocus(nextFocus);
      }}
    />
  );
}

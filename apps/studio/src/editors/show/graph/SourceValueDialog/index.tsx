import type { ImageInputOnUploadProps } from "@mechane/design-system";

import type { ImageAssetReference, ResolvedImageValue, Shape, Type } from "@mechane/domain";
import {
  isArrayStructuredValueTemplate,
  isShapeStructuredValueTemplate,
  normalizeStructuredValueTemplate,
} from "@mechane/domain";
import type { SourceValueRow } from "../inspector/source-value-types";
import { INLINE_STRING_LIMIT } from "../inspector/source-values-helpers";
import { recordIdentifier, type ArrayValueSelection } from "./ArrayValueEditor/types";
import { SourceValueView } from "./SourceValueView";
import { useStructuredValueSession } from "./structured-value-session";

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
  const session = useStructuredValueSession({
    initialValue: initialDraft,
    initialColumnSizes: columnSizes,
    onCommit: onSave,
    onImmediateChange,
    onColumnSizesCommit: onColumnSizesChange,
  });
  const draft = session.value;
  const errors = session.errors;
  const arrayFocus = session.focus;
  const pendingFocus = session.pendingFocus;
  const navigationError = session.navigationError;
  const updateDraft = session.change;
  const commitImmediate = session.changeImmediately;
  const updateErrors = session.reportValidity;
  const commitColumnSizes = session.commitColumnSizes;
  const requestFocus = session.requestFocus;
  const saveDraft = session.commit;
  const selectedRecord =
    arrayFocus.kind === "record"
      ? arraySelectionForValue(draft, shapeArrayType, shapes, arrayFocus.id)
      : null;

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
      columnSizes={session.columnSizes}
      onColumnSizesChange={commitColumnSizes}
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
        session.requestFocus(selection ? { kind: "record", id: selection.id } : { kind: "array" });
      }}
      saveDraft={saveDraft}
      onCancelNavigation={session.cancelPendingFocus}
      onDiscardNavigation={session.discardPendingFocus}
      onSaveNavigation={session.savePendingFocus}
    />
  );
}

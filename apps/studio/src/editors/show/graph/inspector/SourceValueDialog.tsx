import { useEffect, useState } from "react";

import type { ImageInputOnUploadProps } from "@mechane/design-system";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  ChevronRight,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Textarea,
  XIcon,
} from "@mechane/design-system";
import type { ImageAssetReference, ResolvedImageValue, Shape, Type } from "@mechane/domain";
import {
  formatValuePath,
  isArrayStructuredValueTemplate,
  isShapeStructuredValueTemplate,
  normalizeStructuredValueTemplate,
} from "@mechane/domain";
import { ArrayValueEditor } from "../ArrayValueEditor";
import {
  recordIdentifier,
  type ArrayValueFocus,
  type ArrayValueSelection,
} from "../ArrayValueEditor/types";
import { ValueEditor } from "./ValueEditor";
import type { SourceValueRow } from "./source-value-types";
import { INLINE_STRING_LIMIT, sourceValuesEqual } from "./source-values-helpers";

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
  open,
  onOpenChange,
  onSave,
  onClear,
}: {
  nodeName: string;
  row: SourceValueRow;
  shapes: readonly Shape[];
  imageAssets?: readonly (ResolvedImageValue & Pick<ImageAssetReference, "revision">)[];
  onImageUpload?: (props: ImageInputOnUploadProps) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: unknown) => string | null;
  onClear?: () => void;
}) {
  const rowKey = formatValuePath([...row.fieldPath]);
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

  useEffect(() => {
    if (!open) return;
    const nextDraft = draftForRow(row, shapes);
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
    setErrors(new Map());
    setArrayFocus({ kind: "array" });
    setPendingFocus(null);
    setNavigationError(null);
  }, [open, rowKey]);

  const updateDraft = (next: unknown) => {
    setErrors(new Map());
    setDraft(next);
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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          aria-label={`Edit ${row.label}`}
          className={
            shapeArrayType
              ? "h-[min(90vh,780px)] w-[min(76rem,calc(100vw-2rem))] max-w-none overflow-hidden p-0"
              : undefined
          }
        >
          <header className="border-b border-border p-5">
            <DialogTitle>
              <nav aria-label="Value path">
                <ol className="flex min-w-0 items-center gap-1 text-sm">
                  {breadcrumbs.map((breadcrumb, index) => {
                    const isCurrent = index === breadcrumbs.length - 1;
                    const focus = breadcrumb.focus;
                    return (
                      <li
                        key={`${breadcrumb.label}-${index}`}
                        className="flex min-w-0 items-center gap-1"
                      >
                        {index > 0 ? (
                          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : null}
                        {focus && shapeArrayType ? (
                          <button
                            type="button"
                            className={`truncate rounded-sm px-1 py-0.5 ${isCurrent ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                            onClick={() => requestFocus(focus)}
                          >
                            {breadcrumb.label}
                          </button>
                        ) : (
                          <span
                            className={`truncate ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}
                          >
                            {breadcrumb.label}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </DialogTitle>
            <DialogDescription className="sr-only">
              {shapeArrayType
                ? "Browse the array as a table or record list. Changes apply as one undoable source-value edit."
                : "Changes are applied as one undoable source-value edit."}
            </DialogDescription>
            <DialogClose
              render={
                <Button variant="ghost" size="icon" className="rounded-full">
                  <XIcon className="size-4 text-muted-foreground" />
                </Button>
              }
            />
          </header>
          {shapeArrayType ? (
            <ArrayValueEditor
              type={shapeArrayType}
              value={draft}
              shapes={shapes}
              path={[]}
              focus={arrayFocus}
              onChange={updateDraft}
              onValidityChange={updateErrors}
              onSelectionChange={(selection) => {
                setArrayFocus(selection ? { kind: "record", id: selection.id } : { kind: "array" });
              }}
            />
          ) : isLongText ? (
            <Textarea
              autoFocus
              value={typeof draft === "string" ? draft : ""}
              aria-label={`${row.label} value`}
              onChange={(event) => updateDraft(event.target.value)}
            />
          ) : (
            <ValueEditor
              type={row.type}
              value={draft}
              shapes={shapes}
              imageAssets={imageAssets}
              onImageUpload={onImageUpload}
              path={[]}
              onChange={updateDraft}
              onValidityChange={updateErrors}
            />
          )}
          {errors.size > 0 ? (
            <p className="text-sm text-destructive">{[...errors.values()][0]}</p>
          ) : null}
          <DialogFooter className="justify-between">
            {onClear ? (
              <Button type="button" variant="ghost" onClick={onClear}>
                Clear default
              </Button>
            ) : null}
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={errors.size > 0}
                onClick={() => {
                  if (saveDraft()) onOpenChange(false);
                }}
              >
                Apply
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={pendingFocus !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingFocus(null);
            setNavigationError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Save changes before navigating?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes to this value. Save them before moving to another part of the
            array.
          </AlertDialogDescription>
          {navigationError ? <p className="text-sm text-destructive">{navigationError}</p> : null}
          <AlertDialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPendingFocus(null);
                setNavigationError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!pendingFocus) return;
                const nextFocus = pendingFocus;
                setDraft(savedDraft);
                setErrors(new Map());
                setPendingFocus(null);
                setNavigationError(null);
                applyFocus(nextFocus);
              }}
            >
              Discard changes
            </Button>
            <Button
              type="button"
              disabled={errors.size > 0}
              onClick={() => {
                const nextFocus = pendingFocus;
                if (!nextFocus || !saveDraft()) return;
                setPendingFocus(null);
                setNavigationError(null);
                applyFocus(nextFocus);
              }}
            >
              Save changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { useEffect, useState } from "react";

import type { ImageInputOnUploadProps } from "@mechane/design-system";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Textarea,
} from "@mechane/design-system";
import type { ImageAssetReference, ResolvedImageValue, Shape, Type } from "@mechane/domain";
import { formatValuePath, normalizeStructuredValueTemplate } from "@mechane/domain";

import type { SourceValueRow } from "./source-value-types";
import { ArrayValueEditor } from "./ArrayValueEditor";
import { ValueEditor } from "./ValueEditor";
import { INLINE_STRING_LIMIT } from "./source-values-helpers";

type ShapeArrayType = { kind: "array"; of: { kind: "shape"; shapeId: string } };

function isShapeArrayType(type: Type): type is ShapeArrayType {
  return typeof type !== "string" && type.kind === "array" && typeof type.of !== "string" && type.of.kind === "shape";
}
function draftForRow(row: SourceValueRow, shapes: readonly Shape[]) {
  return isShapeArrayType(row.type)
    ? normalizeStructuredValueTemplate(row.value, row.type, shapes)
    : row.value;
}

export function SourceValueDialog({
  row,
  shapes,
  imageAssets,
  onImageUpload,
  open,
  onOpenChange,
  onSave,
  onClear,
}: {
  row: SourceValueRow;
  shapes: readonly Shape[];
  imageAssets?: readonly (ResolvedImageValue & Pick<ImageAssetReference, "revision">)[];
  onImageUpload?: (props: ImageInputOnUploadProps) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: unknown) => string | null;
  onClear?: () => void;
}) {
  const [draft, setDraft] = useState(() => draftForRow(row, shapes));
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const isLongText =
    typeof row.type === "string" &&
    typeof row.value === "string" &&
    (row.value.includes("\n") || row.value.length > INLINE_STRING_LIMIT);
  const shapeArrayType = isShapeArrayType(row.type) ? row.type : null;

  useEffect(() => {
    if (!open) return;
    setDraft(draftForRow(row, shapes));
    setErrors(new Map());
  }, [open, row, shapes]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-label={`Edit ${row.label}`}
        className={
          shapeArrayType
            ? "h-[min(90vh,780px)] w-[min(76rem,calc(100vw-2rem))] max-w-none overflow-hidden p-5"
            : undefined
        }
      >
        <DialogTitle>Edit {row.label}</DialogTitle>
        <DialogDescription>
          {shapeArrayType
            ? "Browse the array as a table or record list. Changes apply as one undoable source-value edit."
            : "Changes are applied as one undoable source-value edit."}
        </DialogDescription>
        {shapeArrayType ? (
          <ArrayValueEditor
            type={shapeArrayType}
            value={draft}
            shapes={shapes}
            path={[]}
            onChange={updateDraft}
            onValidityChange={updateErrors}
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
        {errors.size > 0 ? <p className="text-sm text-destructive">{[...errors.values()][0]}</p> : null}
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
                const conflict = onSave(draft);
                if (conflict) setErrors(new Map([["conflict", conflict]]));
                else onOpenChange(false);
              }}
            >
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

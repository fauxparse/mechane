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
import type { ImageAssetReference, ResolvedImageValue, Shape } from "@mechane/domain";
import { formatValuePath } from "@mechane/domain";

import type { SourceValueRow } from "./source-value-types";
import { INLINE_STRING_LIMIT } from "./source-values-helpers";
import { ValueEditor } from "./ValueEditor";
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
  const [draft, setDraft] = useState(row.value);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const isLongText =
    typeof row.type === "string" &&
    typeof row.value === "string" &&
    (row.value.includes("\n") || row.value.length > INLINE_STRING_LIMIT);

  useEffect(() => {
    if (!open) return;
    setDraft(row.value);
    setErrors(new Map());
  }, [open, row]);

  const updateDraft = (next: unknown) => {
    setErrors(new Map());
    setDraft(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-label={`Edit ${row.label}`}>
        <DialogTitle>Edit {row.label}</DialogTitle>
        <DialogDescription>
          Changes are applied as one undoable source-value edit.
        </DialogDescription>
        {isLongText ? (
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
            onValidityChange={(path, error) => {
              setErrors((current) => {
                const next = new Map(current);
                const key = formatValuePath(path.map(String));
                if (error) next.set(key, error);
                else next.delete(key);
                return next;
              });
            }}
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
          <div className="flex gap-2 items-center">
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

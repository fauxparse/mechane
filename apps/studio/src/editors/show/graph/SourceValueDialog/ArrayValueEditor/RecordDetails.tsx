import { Button, Separator, Trash2 } from "@mechane/design-system";
import type { ImageInputOnUploadProps } from "@mechane/design-system";
import { isShapeStructuredValueTemplate, setValueAtPath, type Shape } from "@mechane/domain";

import { ValueEditor } from "../ValueEditor";
import { previewValue } from "../../inspector/source-values-helpers";
import type { ErrorPath, SourceImageAsset } from "../../inspector/source-value-types";
import type { ShapeRecord } from "./types";
export function RecordDetails({
  record,
  recordIndex,
  fields,
  shapes,
  path,
  readOnly,
  imageAssets,
  onImageUpload,
  onChange,
  onValidityChange,
  onRemove,
  spacious = false,
}: {
  record: ShapeRecord | null;
  recordIndex: number;
  fields: Shape["fields"];
  shapes: readonly Shape[];
  path: ErrorPath;
  readOnly: boolean;
  imageAssets?: readonly SourceImageAsset[];
  onImageUpload?: (props: ImageInputOnUploadProps) => void;
  onChange(record: ShapeRecord): void;
  onValidityChange(path: ErrorPath, error: string | null): void;
  onRemove(): void;
  spacious?: boolean;
}) {
  if (!record) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No record selected.
      </div>
    );
  }

  return (
    <div
      className={`min-w-0 overflow-auto rounded-lg border border-border bg-background p-4 ${spacious ? "sm:p-6" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label">Record detail</p>
          <h3 className="mt-1 text-base font-semibold">Item</h3>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{record.id}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={readOnly}
          aria-label="Remove record"
        >
          <Trash2 />
        </Button>
      </div>
      <Separator className="my-4" />
      <div className="space-y-4">
        {fields.map((field) => {
          const fieldValue = record.fields[field.id];
          return (
            <div key={field.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{field.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {typeof field.type === "string"
                    ? field.type
                    : field.type.kind === "shape"
                      ? "object"
                      : "array"}
                </span>
              </div>
              <ValueEditor
                type={field.type}
                value={fieldValue}
                shapes={shapes}
                imageAssets={imageAssets}
                onImageUpload={onImageUpload}
                readOnly={readOnly}
                path={[...path, recordIndex, field.id]}
                onChange={(next) => {
                  const updated = setValueAtPath(record, [field.id], next);
                  if (isShapeStructuredValueTemplate(updated)) onChange(updated);
                }}
                onValidityChange={onValidityChange}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

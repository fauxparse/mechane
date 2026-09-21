import {
  ImageInput,
  PropertyInput,
  Switch,
  variableTypeIcon,
  type PropertyInputValue,
} from "@mechane/design-system";
import {
  isImageAssetReference,
  isResolvedImageValue,
  isShapeStructuredValueTemplate,
  setValueAtPath,
} from "@mechane/domain";
import { memo, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type { SourceImageAsset } from "../../inspector/source-value-types";
import { previewValue, propertyInputType } from "../../inspector/source-values-helpers";
import { SourceImagePreview } from "../ValueEditor";
import type { ArrayTableCallbacks } from "./array-table-model";
import type { ShapeField, ShapeRecord } from "./types";

type ArrayTableCellProps = {
  field: ShapeField;
  record: ShapeRecord;
  value: unknown;
  readOnly: boolean;
  canUploadImage: boolean;
  imageAssets?: readonly SourceImageAsset[];
  callbacks: ArrayTableCallbacks;
};

/**
 * One editable value in a table row.
 *
 * Memoized against its record, so committing an edit in one row re-renders
 * that row's cells and nothing else. The surrounding `<td>` owns padding and
 * the clipped content box; a cell only renders its control.
 */
export const ArrayTableCell = memo(function ArrayTableCell({
  field,
  record,
  value,
  readOnly,
  canUploadImage,
  imageAssets,
  callbacks,
}: ArrayTableCellProps) {
  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) =>
    callbacks.keyDownInCell(event, record.id, field.id);
  const reportValidity = (error: string | null) =>
    callbacks.reportValidity(record.id, field.id, error);
  const updateValue = (nextValue: unknown) => {
    const updated = setValueAtPath(record, [field.id], nextValue);
    if (isShapeStructuredValueTemplate(updated)) callbacks.changeRecord(updated);
  };

  if (field.type === "image") {
    if (readOnly || !canUploadImage) {
      return (
        <div className="min-w-0" role="group" tabIndex={0} onKeyDown={onKeyDown}>
          <SourceImagePreview value={value} imageAssets={imageAssets} className="max-w-44" />
        </div>
      );
    }
    const resolvedValue = isResolvedImageValue(value)
      ? value
      : isImageAssetReference(value)
        ? (imageAssets?.find(
            (asset) => asset.assetId === value.assetId && asset.revision === value.revision,
          ) ?? null)
        : null;
    return (
      <div className="h-8 min-w-0 flex-1" role="group" onKeyDown={onKeyDown}>
        <ImageInput
          compact
          value={resolvedValue}
          imageAssets={imageAssets}
          readOnly={readOnly}
          allowLink={false}
          onUpload={callbacks.uploadImage}
          onChange={(next) => {
            if (next === null) {
              reportValidity(null);
              updateValue(null);
              return;
            }
            if (!isResolvedImageValue(next)) return;
            const revision = imageAssets?.find((asset) => asset.assetId === next.assetId)?.revision;
            if (!revision) return;
            reportValidity(null);
            updateValue({ assetId: next.assetId, revision });
          }}
        />
      </div>
    );
  }

  if (field.type === "boolean") {
    return (
      <Switch
        checked={value === true}
        disabled={readOnly}
        aria-label={`${field.name} value`}
        onKeyDown={onKeyDown}
        onCheckedChange={(checked) => {
          if (typeof checked !== "boolean") return;
          reportValidity(null);
          updateValue(checked);
        }}
      />
    );
  }

  const inputType = typeof field.type === "string" ? propertyInputType(field.type) : null;
  const isEmptyValue =
    value === null || value === undefined || (typeof value === "string" && value.length === 0);

  if (!inputType || readOnly) {
    return (
      <span role="group" tabIndex={0} onKeyDown={onKeyDown} className="max-w-44 truncate text-xs">
        {isEmptyValue ? "(Empty)" : previewValue(value)}
      </span>
    );
  }

  const inputValue: PropertyInputValue | null =
    inputType === "number"
      ? typeof value === "number"
        ? { kind: "number", value }
        : null
      : typeof value === "string"
        ? { kind: inputType, value }
        : null;

  return (
    <div className="h-8 min-w-0 flex-1" onClick={(event) => event.stopPropagation()}>
      <PropertyInput
        type={inputType}
        value={inputValue}
        icon={variableTypeIcon(field.type)}
        className="h-full"
        allowLink={false}
        ariaLabel={`${field.name} value`}
        placeholder={isEmptyValue ? "(Empty)" : `${field.name} value`}
        onKeyDown={onKeyDown}
        onValidationError={reportValidity}
        onChange={(next) => {
          const nextValue =
            next !== null && typeof next === "object" && "value" in next ? next.value : null;
          reportValidity(null);
          updateValue(nextValue);
        }}
      />
    </div>
  );
});

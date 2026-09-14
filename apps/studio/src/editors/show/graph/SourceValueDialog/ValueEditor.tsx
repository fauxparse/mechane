import type { Gesture, GraphEdit } from "@mechane/commands";
import { setSourceFieldDefault } from "@mechane/commands";
import {
  Button,
  cn,
  ImageInput,
  PlusIcon,
  PropertyInput,
  Switch,
  Trash2Icon,
  type ImageInputValue,
} from "@mechane/design-system";
import {
  defaultValueForType,
  formatValuePath,
  isArrayStructuredValueTemplate,
  isImageAssetReference,
  isResolvedImageValue,
  isShapeStructuredValueTemplate,
  normalizeStructuredValueTemplate,
  setValueAtPath,
  type ResolvedImageValue,
  type ShowGraph,
  type Type,
} from "@mechane/domain";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { typeLabel as graphTypeLabel } from "../node-kinds";
import type { SourceValueEditing } from "../../commands/use-graph-editing";
import type {
  SourceImageAsset,
  SourceValueRow,
  ValueEditorProps,
  ValueEditorRenderer,
} from "../inspector/source-value-types";
import { previewValue, propertyInputType } from "../inspector/source-values-helpers";

function imageAssetForValue(
  value: unknown,
  imageAssets: readonly SourceImageAsset[] = [],
): (SourceImageAsset | ResolvedImageValue) | null {
  if (isResolvedImageValue(value)) return value;
  if (!isImageAssetReference(value)) return null;
  return (
    imageAssets.find(
      (asset) => asset.assetId === value.assetId && asset.revision === value.revision,
    ) ?? null
  );
}

export function SourceImagePreview({
  value,
  imageAssets,
  className,
}: {
  value: unknown;
  imageAssets?: readonly SourceImageAsset[];
  className?: string;
}) {
  const asset = imageAssetForValue(value, imageAssets);
  const name = asset?.name?.trim() || asset?.alt?.trim() || "Unnamed image";
  if (!asset) {
    return <span className={cn("truncate text-xs text-muted-foreground", className)}>{name}</span>;
  }
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <img
        src={asset.url}
        alt={asset.alt || name}
        width={32}
        height={32}
        className="size-8 shrink-0 rounded-sm object-cover"
      />
      <span className="min-w-0 truncate text-xs">{name}</span>
    </span>
  );
}
type SourceValueGesture = Gesture<ShowGraph, GraphEdit>;

type PrimitiveInputProps = Omit<ValueEditorProps, "shapes"> & {
  label?: string;
  actions?: ReactNode;
};

function SourcePrimitiveInput(props: PrimitiveInputProps) {
  if (props.readOnly) {
    if (props.type === "image") return <SourceImageInput {...props} />;
    return <SourceReadOnlyValue value={props.value} label={props.label} />;
  }
  const inputType = typeof props.type === "string" ? propertyInputType(props.type) : null;
  if (props.type === "image") return <SourceImageInput {...props} />;
  if (props.type === "boolean") return <SourceBooleanInput {...props} />;
  if (!inputType)
    return (
      <div className="flex min-w-0 items-center justify-between gap-1">
        <span className="truncate text-sm text-muted-foreground">{previewValue(props.value)}</span>
        {props.actions}
      </div>
    );
  return <SourceValueInput {...props} inputType={inputType} />;
}

function SourceReadOnlyValue({ value, label }: Pick<PrimitiveInputProps, "value" | "label">) {
  return (
    <div
      aria-label={label ? `${label} value` : undefined}
      className="rounded-sm bg-muted/50 px-2 py-1 text-sm text-muted-foreground"
    >
      {previewValue(value)}
    </div>
  );
}

function SourceImageInput({
  value,
  path,
  imageAssets,
  onImageUpload,
  onChange,
  onValidityChange,
  readOnly,
}: PrimitiveInputProps) {
  const resolvedValue = isResolvedImageValue(value)
    ? value
    : isImageAssetReference(value)
      ? ((imageAssets ?? []).find(
          (asset) => asset.assetId === value.assetId && asset.revision === value.revision,
        ) ?? null)
      : null;
  return (
    <ImageInput
      value={resolvedValue}
      imageAssets={imageAssets}
      readOnly={readOnly}
      allowLink={false}
      onUpload={onImageUpload}
      onChange={(next: ImageInputValue | null) => {
        if (next === null) {
          onValidityChange(path, null);
          onChange(null);
          return;
        }
        if (!isResolvedImageValue(next)) {
          onValidityChange(path, "The selected image is not resolved.");
          return;
        }
        const revision = isImageAssetReference(next)
          ? next.revision
          : imageAssets?.find((asset) => asset.assetId === next.assetId)?.revision;
        if (!revision) {
          onValidityChange(path, "The selected image has no revision.");
          return;
        }
        onValidityChange(path, null);
        onChange({ assetId: next.assetId, revision });
      }}
      onError={(error) => onValidityChange(path, error.message)}
    />
  );
}

function SourceBooleanInput({
  value,
  path,
  label,
  actions,
  onChange,
  onValidityChange,
}: PrimitiveInputProps) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Switch
        checked={value === true}
        onCheckedChange={(checked) => {
          if (typeof checked === "boolean") {
            setError(null);
            onValidityChange(path, null);
            onChange(checked);
          }
        }}
        aria-label={label ? `${label} value` : "Boolean value"}
      />
      {actions}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

function SourceValueInput({
  type,
  value,
  path,
  label,
  actions,
  onChange,
  onValidityChange,
  inputType,
}: PrimitiveInputProps & { inputType: "text" | "number" | "color" }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <PropertyInput
        type={inputType}
        value={
          value === null || value === undefined
            ? null
            : inputType === "number" && typeof value === "number"
              ? { kind: "number", value }
              : inputType !== "number" && typeof value === "string"
                ? { kind: inputType, value }
                : null
        }
        allowLink={false}
        actions={actions}
        placeholder={label ? `${label} value` : `${type} value`}
        onValidationError={(message) => {
          setError(message);
          onValidityChange(path, message);
        }}
        onChange={(next) => {
          const rawValue = next !== null && "value" in next ? next.value : null;
          setError(null);
          onValidityChange(path, null);
          onChange(rawValue);
        }}
      />
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

function ArrayValueEditor({
  type,
  value,
  shapes,
  imageAssets,
  onImageUpload,
  path,
  onChange,
  onValidityChange,
  renderValue,
  readOnly,
}: ValueEditorProps & {
  type: Extract<Type, { kind: "array" }>;
  renderValue: ValueEditorRenderer;
}) {
  const normalized = normalizeStructuredValueTemplate(value, type, shapes);
  if (!isArrayStructuredValueTemplate(normalized)) return null;
  const values = normalized.items;
  const updateItems = (items: typeof values) => onChange({ ...normalized, items });
  return (
    <div className="flex flex-col gap-2">
      {values.map((item, index) => {
        const itemId =
          isShapeStructuredValueTemplate(item) || isArrayStructuredValueTemplate(item)
            ? item.id
            : undefined;
        return (
          <div
            className="flex items-start gap-2"
            key={`${formatValuePath(path.map(String))}-${itemId ?? index}`}
          >
            {renderValue({
              type: type.of,
              value: item,
              shapes,
              readOnly,
              imageAssets,
              onImageUpload,
              path: [...path, index],
              onChange: (next) =>
                updateItems(
                  values.map((current, currentIndex) =>
                    currentIndex === index
                      ? normalizeStructuredValueTemplate(next, type.of, shapes)
                      : current,
                  ),
                ),
              onValidityChange,
            })}
            {!readOnly ? (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove item ${index + 1}`}
                onClick={() =>
                  updateItems(values.filter((_, currentIndex) => currentIndex !== index))
                }
              >
                <Trash2Icon />
              </Button>
            ) : null}
          </div>
        );
      })}
      {!readOnly ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() =>
            updateItems([
              ...values,
              normalizeStructuredValueTemplate(
                defaultValueForType(type.of, shapes),
                type.of,
                shapes,
              ),
            ])
          }
        >
          <PlusIcon />
          Add item
        </Button>
      ) : null}
    </div>
  );
}

function ShapeValueEditor({
  type,
  value,
  shapes,
  imageAssets,
  onImageUpload,
  path,
  onChange,
  onValidityChange,
  renderValue,
  readOnly,
}: ValueEditorProps & {
  type: Extract<Type, { kind: "shape" }>;
  renderValue: ValueEditorRenderer;
}) {
  const shape = shapes.find((candidate) => candidate.id === type.shapeId);
  if (!shape) return <p className="text-sm text-destructive">Shape definition is unavailable.</p>;
  const normalized = normalizeStructuredValueTemplate(value, type, shapes);
  if (!isShapeStructuredValueTemplate(normalized)) return null;
  const objectValue = normalized.fields;
  return (
    <div className="flex flex-col gap-3">
      {shape.fields.map((field) => (
        <div className="flex flex-col gap-1" key={field.id}>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>{field.name}</span>
            <span className="text-xs text-muted-foreground">
              {graphTypeLabel(field.type, shapes)}
            </span>
          </div>
          {renderValue({
            type: field.type,
            value: Reflect.get(objectValue, field.id),
            readOnly,
            shapes,
            imageAssets,
            onImageUpload,
            path: [...path, field.id],
            onChange: (next) => onChange(setValueAtPath(normalized, [field.id], next)),
            onValidityChange,
          })}
        </div>
      ))}
    </div>
  );
}
export function ValueEditor(props: ValueEditorProps) {
  const { type, value, shapes, onChange, readOnly = false } = props;
  if (typeof type === "string") {
    return (
      <SourcePrimitiveInput key={formatValuePath(props.path.map(String))} {...props} type={type} />
    );
  }
  if (value === null) {
    if (readOnly) return <SourceReadOnlyValue value={value} />;
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange(defaultValueForType(type, shapes))}
      >
        Use {graphTypeLabel(type, shapes) ?? "value"} value
      </Button>
    );
  }
  if (type.kind === "array") {
    return (
      <ArrayValueEditor {...props} type={type} renderValue={ValueEditor} readOnly={readOnly} />
    );
  }
  if (type.kind === "shape") {
    return (
      <ShapeValueEditor {...props} type={type} renderValue={ValueEditor} readOnly={readOnly} />
    );
  }
  const exhaustive: never = type;
  return exhaustive;
}

export function InlineValue({
  row,
  nodeId,
  editing,
  actions,
}: {
  row: SourceValueRow;
  nodeId: string;
  editing: SourceValueEditing;
  actions?: ReactNode;
}) {
  const gesture = useRef<SourceValueGesture | null>(null);
  const commitTimer = useRef<number | null>(null);
  const primitiveType = typeof row.type === "string" ? row.type : "text";

  useEffect(
    () => () => {
      if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
      gesture.current?.commit();
    },
    [],
  );

  const finishGesture = () => {
    if (commitTimer.current !== null) {
      window.clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    gesture.current?.commit();
    gesture.current = null;
  };

  const scheduleFinish = () => {
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(finishGesture, 400);
  };

  const updateValue = (value: unknown) => {
    const currentGesture =
      gesture.current ??
      (gesture.current = editing.commands.beginGesture({
        key: `sourceFieldDefault:${nodeId}:${formatValuePath([...row.fieldPath])}`,
        label: `Edit ${row.label}`,
      }));
    currentGesture.update(setSourceFieldDefault(nodeId, row.fieldPath, value));
  };

  return (
    <SourcePrimitiveInput
      type={primitiveType}
      value={row.value}
      path={row.fieldPath}
      label={row.label}
      actions={actions}
      onChange={(value) => {
        updateValue(value);
        if (primitiveType === "boolean") finishGesture();
        else scheduleFinish();
      }}
      onValidityChange={() => {}}
    />
  );
}

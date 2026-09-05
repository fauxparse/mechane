import type { Gesture, GraphEdit } from "@mechane/commands";
import { setSourceFieldDefault } from "@mechane/commands";
import {
  Button,
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
  type ShowGraph,
  type Type,
} from "@mechane/domain";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { SourceValueEditing } from "../../commands/use-graph-editing";
import { typeLabel as graphTypeLabel } from "../node-kinds";
import type { SourceValueRow, ValueEditorProps, ValueEditorRenderer } from "./source-value-types";
import { previewValue, propertyInputType } from "./source-values-helpers";

type SourceValueGesture = Gesture<ShowGraph, GraphEdit>;

type PrimitiveInputProps = Omit<ValueEditorProps, "shapes"> & {
  label?: string;
  actions?: ReactNode;
};

function SourcePrimitiveInput({
  type,
  value,
  path,
  imageAssets: propsImageAssets,
  onImageUpload: propsOnImageUpload,
  label,
  actions,
  onChange,
  onValidityChange,
}: PrimitiveInputProps) {
  const inputType = typeof type === "string" ? propertyInputType(type) : null;
  const [error, setError] = useState<string | null>(null);
  if (type === "image") {
    const resolvedValue = isResolvedImageValue(value)
      ? value
      : isImageAssetReference(value)
        ? ((propsImageAssets ?? []).find(
            (asset) => asset.assetId === value.assetId && asset.revision === value.revision,
          ) ?? null)
        : null;
    return (
      <ImageInput
        value={resolvedValue}
        imageAssets={propsImageAssets}
        allowLink={false}
        onUpload={propsOnImageUpload}
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
            : propsImageAssets?.find((asset) => asset.assetId === next.assetId)?.revision;
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

  if (type === "boolean") {
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
      </div>
    );
  }
  if (!inputType)
    return (
      <div className="flex min-w-0 items-center justify-between gap-1">
        <span className="truncate text-sm text-muted-foreground">{previewValue(value)}</span>
        {actions}
      </div>
    );

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
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() =>
          updateItems([
            ...values,
            normalizeStructuredValueTemplate(defaultValueForType(type.of, shapes), type.of, shapes),
          ])
        }
      >
        <PlusIcon />
        Add item
      </Button>
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
  const { type, value, shapes, onChange } = props;
  if (typeof type === "string") {
    return (
      <SourcePrimitiveInput key={formatValuePath(props.path.map(String))} {...props} type={type} />
    );
  }
  if (value === null) {
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
    return <ArrayValueEditor {...props} type={type} renderValue={ValueEditor} />;
  }
  if (type.kind === "shape") {
    return <ShapeValueEditor {...props} type={type} renderValue={ValueEditor} />;
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

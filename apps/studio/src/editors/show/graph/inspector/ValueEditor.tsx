import type { Gesture, GraphEdit } from "@mechane/commands";
import { setSourceFieldDefault } from "@mechane/commands";
import { Button, PlusIcon, PropertyInput, Switch, Trash2Icon } from "@mechane/design-system";
import {
  defaultValueForType,
  formatValuePath,
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
  label,
  actions,
  onChange,
  onValidityChange,
}: PrimitiveInputProps) {
  const inputType = typeof type === "string" ? propertyInputType(type) : null;
  const [error, setError] = useState<string | null>(null);

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
  path,
  onChange,
  onValidityChange,
  renderValue,
}: ValueEditorProps & {
  type: Extract<Type, { kind: "array" }>;
  renderValue: ValueEditorRenderer;
}) {
  const values = Array.isArray(value) ? value : [];
  return (
    <div className="flex flex-col gap-2">
      {values.map((item, index) => (
        <div
          className="flex items-start gap-2"
          key={`${formatValuePath(path.map(String))}-${index}`}
        >
          {renderValue({
            type: type.of,
            value: item,
            shapes,
            path: [...path, index],
            onChange: (next) =>
              onChange(
                values.map((current, currentIndex) => (currentIndex === index ? next : current)),
              ),
            onValidityChange,
          })}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove item ${index + 1}`}
            onClick={() => onChange(values.filter((_, currentIndex) => currentIndex !== index))}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => onChange([...values, defaultValueForType(type.of, shapes)])}
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
  const objectValue = value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
            path: [...path, field.id],
            onChange: (next) => onChange(setValueAtPath(objectValue, [field.id], next)),
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
        size="sm"
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

import { typeLabel as graphTypeLabel } from "../node-kinds";
import { setValueAtPath, type Type } from "@mechane/domain";

import type { ValueEditorProps, ValueEditorRenderer } from "./source-value-types";

export function ShapeEditor({
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
  const objectValue: Record<string, unknown> =
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value))
      : {};
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

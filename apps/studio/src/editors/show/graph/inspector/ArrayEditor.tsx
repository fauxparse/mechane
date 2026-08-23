import { Button, PlusIcon, Trash2Icon } from "@mechane/design-system";
import { defaultValueForType, formatValuePath, type Type } from "@mechane/domain";

import type { ValueEditorProps, ValueEditorRenderer } from "./source-value-types";

export function ArrayEditor({
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

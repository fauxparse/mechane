import { useState } from "react";

import { PropertyInput, Switch } from "@mechane/design-system";

import { previewValue, propertyInputType } from "./source-values-helpers";
import type { ValueEditorProps } from "./source-value-types";

export function SourcePrimitiveInput({
  type,
  value,
  path,
  label,
  onChange,
  onValidityChange,
}: Omit<ValueEditorProps, "shapes"> & { label?: string }) {
  const inputType = typeof type === "string" ? propertyInputType(type) : null;
  const [error, setError] = useState<string | null>(null);

  if (type === "boolean") {
    return (
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
    );
  }
  if (!inputType)
    return <span className="text-sm text-muted-foreground">{previewValue(value)}</span>;

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

import { useState, type ReactNode } from "react";

import { PropertyInput, Switch } from "@mechane/design-system";

import type { ValueEditorProps } from "./source-value-types";
import { previewValue, propertyInputType } from "./source-values-helpers";

export function SourcePrimitiveInput({
  type,
  value,
  path,
  label,
  actions,
  onChange,
  onValidityChange,
}: Omit<ValueEditorProps, "shapes"> & { label?: string; actions?: ReactNode }) {
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

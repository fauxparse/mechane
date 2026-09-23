import {
  PropertyInput,
  type PropertyInputConstraints,
  type PropertyInputValue,
} from "@mechane/design-system";
import type { AxisSize } from "@mechane/domain";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import {
  isVariableInput,
  literalValue,
  sizeInputValue,
  sizingForMode,
  variableOptions,
  type SizeConstraint,
} from "./canvas-inspector-values";
import type { SizeFieldProps } from "./SizeField";
// PROTOTYPE #712 — see ./prototype-percentage-entry.
import { usePercentageOverrides } from "./prototype-percentage-entry";

type SizeFieldInputProps = {
  axis: SizeFieldProps["axis"];
  constraints?: PropertyInputConstraints;
  onConstraintToggle?: (constraint: SizeConstraint, enabled: boolean) => void;
  size: AxisSize | undefined;
  sizeMixed: boolean;
  previewValue: number | undefined;
  currentValue: number | undefined;
  previewing: boolean;
  mode: AxisSize["mode"] | undefined;
  unit: "px" | "%";
  sizeVariables: ReturnType<typeof variableOptions>;
  shapes: ReturnType<typeof useCanvasInspectorContext>["shapes"];
  updateSize(next: AxisSize): void;
};

export const SizeFieldInput = ({
  axis,
  constraints,
  onConstraintToggle,
  size,
  sizeMixed,
  previewValue,
  currentValue,
  previewing,
  mode,
  unit,
  sizeVariables,
  shapes,
  updateSize,
}: SizeFieldInputProps) => {
  // PROTOTYPE #712 — empty without `?variant=`, so this row is the shipped row.
  const percentage = usePercentageOverrides({ axis });
  return (
    <PropertyInput
      icon={axis === "width" ? "W" : "H"}
      type="number"
      dimension={axis}
      unit={percentage.unit ?? unit}
      placeholder={
        sizeMixed ? "Mixed" : mode === "fill" ? "Fill" : mode === "hug" ? "Hug" : undefined
      }
      value={
        previewing
          ? literalValue("number", previewValue)
          : sizeMixed
            ? null
            : sizeInputValue(size, sizeVariables, shapes)
      }
      sizing={mode}
      variables={sizeVariables}
      min={0}
      constraints={constraints}
      onConstraintToggle={onConstraintToggle}
      actions={percentage.actions}
      menuItems={percentage.menuItems}
      onMenuSelect={percentage.onMenuSelect}
      onRawCommit={percentage.onRawCommit}
      onSizingChange={(nextMode) => {
        if (percentage.onSizingChange?.(nextMode)) return;
        updateSize(sizingForMode(sizeMixed ? undefined : size, nextMode, currentValue));
      }}
      onChange={(next: PropertyInputValue | null) => {
        if (isVariableInput(next)) {
          updateSize({
            ...(sizeMixed ? {} : size),
            mode: "fixed",
            value: {
              kind: "variable",
              variableId: next.id,
              fieldPath: next.fieldPath ?? [],
            },
          });
        } else if (next?.kind === "number") {
          updateSize({
            ...(sizeMixed ? {} : size),
            mode: "fixed",
            value: unit === "%" ? { value: next.value, unit } : next.value,
          });
        }
      }}
    />
  );
};

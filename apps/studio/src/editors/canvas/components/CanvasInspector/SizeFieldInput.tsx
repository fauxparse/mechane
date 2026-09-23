import {
  PropertyInput,
  type PropertyInputConstraints,
  type PropertyInputValue,
} from "@mechane/design-system";
import type { AxisSize, PropertyFormula } from "@mechane/domain";

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
  formula: PropertyFormula | null;
  sizeVariables: ReturnType<typeof variableOptions>;
  shapes: ReturnType<typeof useCanvasInspectorContext>["shapes"];
  updateSize(next: AxisSize): void;
  onWriteFormula(): void;
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
  formula,
  sizeVariables,
  shapes,
  updateSize,
  onWriteFormula,
}: SizeFieldInputProps) => (
  <PropertyInput
    icon={axis === "width" ? "W" : "H"}
    type="number"
    dimension={axis}
    unit={unit}
    placeholder={
      sizeMixed
        ? "Mixed"
        : formula
          ? formula.formula
          : mode === "fill"
            ? "Fill"
            : mode === "hug"
              ? "Hug"
              : undefined
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
    menuItems={[{ value: "formula", label: "Write formula" }]}
    onMenuItemSelect={(item) => {
      if (item === "formula") onWriteFormula();
    }}
    onSizingChange={(nextMode) => {
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
            fallback:
              size?.value &&
              typeof size.value === "object" &&
              "value" in size.value &&
              typeof size.value.value === "number"
                ? size.value
                : currentValue,
          },
        });
      } else if (next?.kind === "number") {
        const nextUnit = "unit" in next ? next.unit : undefined;
        updateSize({
          ...(sizeMixed ? {} : size),
          mode: "fixed",
          value:
            nextUnit === "%"
              ? { value: next.value, unit: "%" }
              : nextUnit === "px"
                ? { value: next.value, unit: "px" }
                : next.value,
        });
      }
    }}
  />
);

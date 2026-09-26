import {
  PropertyInput,
  type PropertyInputConstraints,
  type PropertyInputValue,
} from "@mechane/design-system";
import type { AxisSize } from "@mechane/domain/canvas";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import {
  isVariableInput,
  literalValue,
  sizeInputValue,
  sizingForMode,
  variableOptions,
  type SizeConstraint,
} from "./canvas-inspector-values";
import type { PropertyFormulaEntry } from "./PropertyFormulaField";
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
  sizeVariables: ReturnType<typeof variableOptions>;
  shapes: ReturnType<typeof useCanvasInspectorContext>["shapes"];
  updateSize(next: AxisSize): void;
  /** Formula entry, when the row can carry one: `=` and the menu item. */
  entry?: PropertyFormulaEntry;
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
  entry,
}: SizeFieldInputProps) => (
  <PropertyInput
    icon={axis === "width" ? "W" : "H"}
    type="number"
    dimension={axis}
    unit={unit}
    placeholder={
      sizeMixed ? "(mixed)" : mode === "fill" ? "Fill" : mode === "hug" ? "Hug" : undefined
    }
    value={
      previewing
        ? literalValue("number", previewValue)
        : sizeMixed || entry?.formula
          ? null
          : mode === "fill" || mode === "hug"
            ? // Fill and Hug store no size; the chip reads the laid-out one.
              literalValue("number", currentValue)
            : sizeInputValue(size, sizeVariables, shapes)
    }
    formula={previewing ? null : entry?.formula}
    sizing={mode}
    variables={sizeVariables}
    min={0}
    constraints={constraints}
    onConstraintToggle={onConstraintToggle}
    menuItems={entry?.menuItems}
    onMenuItemSelect={entry?.onMenuItemSelect}
    onKeyDown={entry?.onKeyDown}
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

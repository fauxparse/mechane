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
// PROTOTYPE #711 — the W/H row is the issue's named special case: it already
// carries an icon, a unit, hug/fill/fixed, min/max toggles and a Variable
// picker before a Formula mode is added to it.
import {
  activeVariant,
  PrototypeFormulaProperty,
  type FormulaInputOverrides,
} from "./prototype-property-formula";
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
  const variant = activeVariant();

  const input = (overrides: FormulaInputOverrides = {}) => (
    <PropertyInput
      icon={axis === "width" ? "W" : "H"}
      type="number"
      dimension={axis}
      unit={unit}
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
      menuItems={overrides.menuItems}
      onMenuSelect={overrides.onMenuSelect}
      actions={overrides.actions}
      onKeyDown={overrides.onKeyDown}
      onConstraintToggle={onConstraintToggle}
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

  if (!variant) return input();
  return (
    <PrototypeFormulaProperty
      variant={variant}
      slot={{
        icon: axis === "width" ? "W" : "H",
        property: `sizing.${axis}`,
        label: axis === "width" ? "Width" : "Height",
        type: "number",
        // A Formula names a number, so the sizing mode is necessarily fixed.
        commit: (evaluated) =>
          updateSize({
            ...(sizeMixed ? {} : size),
            mode: "fixed",
            value:
              unit === "%" && evaluated.kind === "number"
                ? { value: evaluated.value, unit }
                : (evaluated.value as number),
          }),
      }}
    >
      {input}
    </PrototypeFormulaProperty>
  );
};

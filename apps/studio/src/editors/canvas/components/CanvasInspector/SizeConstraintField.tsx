import { PropertyInput, type PropertyInputValue } from "@mechane/design-system";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import {
  isVariableInput,
  sizeConstraintKey,
  sizeValueNumber,
  sizeValueUnit,
  type SizeConstraint,
} from "./canvas-inspector-values";

const CONSTRAINT_ICONS: Record<SizeConstraint, string> = { min: "≥", max: "≤" };

type SizeConstraintFieldProps = {
  axis: "width" | "height";
  constraint: SizeConstraint;
  /** Shown when nothing is stored, so a constraint the editor must see still reads a size. */
  fallback?: number;
};

export const SizeConstraintField = ({ axis, constraint, fallback }: SizeConstraintFieldProps) => {
  const { target, update } = useCanvasInspectorContext();
  const key = sizeConstraintKey(axis, constraint);
  const stored = target.sizing?.[key];
  const unit = sizeValueUnit(stored);
  const value = sizeValueNumber(stored) ?? fallback ?? null;
  const label = `${constraint === "min" ? "Min" : "Max"} ${axis}`;

  return (
    <PropertyInput
      icon={CONSTRAINT_ICONS[constraint]}
      type="number"
      unit={unit}
      placeholder={label}
      value={value === null ? null : { kind: "number", value }}
      min={0}
      allowLink={false}
      onChange={(next: PropertyInputValue | null) => {
        if (isVariableInput(next)) return;
        const nextUnit = next?.kind === "number" && "unit" in next ? next.unit : undefined;
        const nextValue =
          next?.kind === "number"
            ? nextUnit === "%"
              ? { value: next.value, unit: "%" }
              : nextUnit === "px"
                ? { value: next.value, unit: "px" }
                : next.value
            : undefined;
        update({ sizing: { ...target.sizing, [key]: nextValue } });
      }}
    />
  );
};

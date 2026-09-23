import { PropertyInput, type PropertyInputValue } from "@mechane/design-system";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import {
  isVariableInput,
  sizeConstraintKey,
  sizeValueNumber,
  sizeValueUnit,
  type SizeConstraint,
} from "./canvas-inspector-values";
// PROTOTYPE #712 — see ./prototype-percentage-entry.
import { usePercentageOverrides } from "./prototype-percentage-entry";

const CONSTRAINT_ICONS: Record<SizeConstraint, string> = { min: "≥", max: "≤" };

type SizeConstraintFieldProps = {
  axis: "width" | "height";
  constraint: SizeConstraint;
};

export const SizeConstraintField = ({ axis, constraint }: SizeConstraintFieldProps) => {
  const { target, update } = useCanvasInspectorContext();
  // PROTOTYPE #712 — empty without `?variant=`, so this row is the shipped row.
  const percentage = usePercentageOverrides({ axis, constraint });
  const key = sizeConstraintKey(axis, constraint);
  const stored = target.sizing?.[key];
  const unit = sizeValueUnit(stored);
  const value = sizeValueNumber(stored);
  const label = `${constraint === "min" ? "Min" : "Max"} ${axis}`;

  return (
    <PropertyInput
      icon={CONSTRAINT_ICONS[constraint]}
      type="number"
      unit={percentage.unit ?? unit}
      placeholder={label}
      value={value === null ? null : { kind: "number", value }}
      min={0}
      allowLink={false}
      actions={percentage.actions}
      menuItems={percentage.menuItems}
      onMenuSelect={percentage.onMenuSelect}
      onRawCommit={percentage.onRawCommit}
      onChange={(next: PropertyInputValue | null) => {
        if (isVariableInput(next)) return;
        const nextValue =
          next?.kind === "number"
            ? unit === "%"
              ? { value: next.value, unit }
              : next.value
            : undefined;
        update({ sizing: { ...target.sizing, [key]: nextValue } });
      }}
    />
  );
};

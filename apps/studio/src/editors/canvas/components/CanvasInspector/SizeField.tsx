import type { AxisSize } from "@mechane/domain";
import type { PropertyInputConstraints } from "@mechane/design-system";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { variableOptions, type SizeConstraint } from "./canvas-inspector-values";
import { SizeFieldInput } from "./SizeFieldInput";

export type SizeFieldProps = {
  axis: "width" | "height";
  constraints?: PropertyInputConstraints;
  onConstraintToggle?: (constraint: SizeConstraint, enabled: boolean) => void;
};

export const SizeField = ({ axis, constraints, onConstraintToggle }: SizeFieldProps) => {
  const {
    target,
    selected,
    common,
    variables,
    shapes,
    inspectorPreview,
    currentDimensions,
    update,
  } = useCanvasInspectorContext();
  const size = common(`sizing.${axis}`) as AxisSize | undefined;
  const sizeMixed =
    size === undefined && selected.some((element) => element.sizing?.[axis] !== undefined);
  const updateSize = (next: AxisSize) => {
    update({ sizing: { ...target.sizing, [axis]: next } });
  };
  const previewValue =
    selected.length === 1 && inspectorPreview?.elementId === target.id
      ? inspectorPreview[axis]
      : undefined;
  const currentValue =
    previewValue ??
    (selected.length === 1 && currentDimensions?.elementId === target.id
      ? currentDimensions[axis]
      : undefined);
  const previewing = previewValue !== undefined;
  const mode = previewing ? "fixed" : sizeMixed ? undefined : (size?.mode ?? "hug");
  const unit = previewing
    ? "px"
    : size?.value &&
        typeof size.value === "object" &&
        "unit" in size.value &&
        size.value.unit === "%"
      ? "%"
      : "px";
  const sizeVariables = variableOptions("number", variables, shapes);
  return (
    <SizeFieldInput
      axis={axis}
      constraints={constraints}
      onConstraintToggle={onConstraintToggle}
      size={size}
      sizeMixed={sizeMixed}
      previewValue={previewValue}
      currentValue={currentValue}
      previewing={previewing}
      mode={mode}
      unit={unit}
      sizeVariables={sizeVariables}
      shapes={shapes}
      updateSize={updateSize}
    />
  );
};

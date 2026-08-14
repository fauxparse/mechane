import type { SceneVariable } from "@mechane/domain";
import {
  CANVAS_PROPERTY_DESCRIPTORS,
  canvasPropertyDescriptor,
  opacityFromPercent,
  propertyCoercion,
} from "@mechane/domain";
import { PropertyInput, type LucideIcon, type PropertyInputValue } from "@mechane/design-system";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import {
  inputType,
  isVariableInput,
  literalValue,
  opacityInputValue,
  sizeInputValue,
  variableInput,
} from "./canvas-inspector-values";

type PropertyFieldProps = {
  name: (typeof CANVAS_PROPERTY_DESCRIPTORS)[number]["name"];
  icon?: LucideIcon | string;
  className?: string;
};

export function PropertyField({ name, icon, className }: PropertyFieldProps) {
  const { target, elements, selected, variables, common, update } = useCanvasInspectorContext();
  const descriptor = canvasPropertyDescriptor(name, target);
  if (!descriptor) return null;
  if (elements.length > 0 && !elements.every((element) => canvasPropertyDescriptor(name, element)))
    return null;

  const rawValue = common(name);
  const isUnset =
    rawValue === undefined &&
    selected.length > 0 &&
    selected.every((element) => !(name in element) || Reflect.get(element, name) === undefined);
  const defaultValue = isUnset
    ? name === "opacity"
      ? 1
      : name === "cornerRadius"
        ? 0
        : undefined
    : rawValue;
  const value =
    name === "opacity"
      ? opacityInputValue(variableInput(defaultValue, descriptor.targetType, variables))
      : variableInput(defaultValue, descriptor.targetType, variables);
  const type = inputType(descriptor.targetType);
  if (!type) return null;
  const availableVariables = variables.filter(
    (variable) => variable.type && propertyCoercion(variable.type, descriptor.targetType),
  );

  return (
    <PropertyInput
      className={className}
      type={type}
      value={value}
      variables={availableVariables}
      unit={name === "opacity" ? "%" : undefined}
      icon={icon}
      min={name === "opacity" ? 0 : undefined}
      max={name === "opacity" ? 100 : undefined}
      step={name === "opacity" ? 1 : undefined}
      onChange={(next) => {
        if (isVariableInput(next)) {
          update({
            [name]: { kind: "variable", variableId: next.id },
          });
        } else if (next === null) {
          update({}, [name]);
        } else {
          const nextValue =
            name === "opacity" && next.kind === "number"
              ? opacityFromPercent(next.value)
              : next.value;
          update({ [name]: nextValue });
        }
      }}
    />
  );
}

type SizeFieldProps = {
  axis: "width" | "height";
};

export function SizeField({ axis }: SizeFieldProps) {
  const { target, variables, inspectorPreview, update } = useCanvasInspectorContext();
  const size = target[axis];
  const previewValue =
    inspectorPreview?.elementId === target.id ? inspectorPreview[axis] : undefined;
  const previewing = previewValue !== undefined;
  const mode = previewing ? "fixed" : (size?.mode ?? "hug");
  const unit = previewing
    ? "px"
    : size?.value &&
        typeof size.value === "object" &&
        "unit" in size.value &&
        size.value.unit === "%"
      ? "%"
      : "px";
  const sizeVariables = variables.filter((variable: SceneVariable) => variable.type === "number");

  return (
    <PropertyInput
      icon={axis === "width" ? "W" : "H"}
      type="number"
      dimension={axis}
      unit={unit}
      placeholder={mode === "fill" ? "Fill" : mode === "hug" ? "Hug" : undefined}
      value={
        previewing ? literalValue("number", previewValue) : sizeInputValue(size, sizeVariables)
      }
      sizing={mode}
      variables={sizeVariables}
      min={0}
      onSizingChange={(nextMode) =>
        update({
          [axis]: {
            ...size,
            mode: nextMode,
            ...(nextMode === "fixed" && size?.value === undefined ? { value: 100 } : {}),
          },
        })
      }
      onChange={(next: PropertyInputValue | null) => {
        if (isVariableInput(next)) {
          update({
            [axis]: {
              ...size,
              mode: "fixed",
              value: { kind: "variable", variableId: next.id },
            },
          });
        } else if (next?.kind === "number") {
          update({
            [axis]: {
              ...size,
              mode: "fixed",
              value: unit === "%" ? { value: next.value, unit } : next.value,
            },
          });
        }
      }}
    />
  );
}

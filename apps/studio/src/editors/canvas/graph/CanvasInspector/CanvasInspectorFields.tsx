import type { AxisSize, SceneVariable } from "@mechane/domain";
import {
  CANVAS_PROPERTY_DESCRIPTORS,
  canvasPropertyDescriptor,
  opacityFromPercent,
  propertyCoercion,
} from "@mechane/domain";
import {
  PropertyInput,
  type LucideIcon,
  type PropertyInputPreset,
  type PropertyInputValue,
} from "@mechane/design-system";

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
  placeholder?: string;
  presets?: readonly PropertyInputPreset[];
};

export const PropertyField = ({
  name,
  icon,
  className,
  placeholder,
  presets,
}: PropertyFieldProps) => {
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
        : name === "fontSize"
          ? 16
          : name === "lineHeight"
            ? "auto"
            : name === "letterSpacing"
              ? 0
              : undefined
    : rawValue;
  const isAuto = name === "lineHeight" && defaultValue === "auto";
  const value = isAuto
    ? null
    : name === "opacity"
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
      placeholder={isAuto ? "Auto" : placeholder}
      unit={name === "opacity" ? "%" : undefined}
      step={name === "opacity" ? 1 : undefined}
      presets={presets}
      variables={availableVariables}
      allowAuto={name === "lineHeight"}
      auto={isAuto}
      onAutoChange={
        name === "lineHeight" ? (nextAuto) => update({ [name]: nextAuto ? "auto" : 0 }) : undefined
      }
      icon={icon}
      min={name === "opacity" ? 0 : undefined}
      max={name === "opacity" ? 100 : undefined}
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
};

type SizeFieldProps = {
  axis: "width" | "height";
};

export const SizeField = ({ axis }: SizeFieldProps) => {
  const { target, variables, inspectorPreview, update } = useCanvasInspectorContext();
  const size = target.sizing?.[axis];
  const updateSize = (next: AxisSize) => {
    update({ sizing: { ...target.sizing, [axis]: next } });
  };
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
      onSizingChange={(nextMode) => {
        updateSize({
          ...size,
          mode: nextMode,
          ...(nextMode === "fixed" && size?.value === undefined ? { value: 100 } : {}),
        });
      }}
      onChange={(next: PropertyInputValue | null) => {
        if (isVariableInput(next)) {
          updateSize({
            ...size,
            mode: "fixed",
            value: { kind: "variable", variableId: next.id },
          });
        } else if (next?.kind === "number") {
          updateSize({
            ...size,
            mode: "fixed",
            value: unit === "%" ? { value: next.value, unit } : next.value,
          });
        }
      }}
    />
  );
};

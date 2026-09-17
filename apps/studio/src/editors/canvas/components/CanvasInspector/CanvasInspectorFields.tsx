import { PropertyInput, type LucideIcon, type PropertyInputPreset } from "@mechane/design-system";
import { elementPropertyDescriptor, type ElementPropertyName } from "@mechane/domain";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import {
  inputType,
  isVariableInput,
  variableInput,
  variableOptions,
} from "./canvas-inspector-values";

type PropertyFieldProps = {
  name: ElementPropertyName;
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
  const { target, elements, selected, variables, shapes, common, update } =
    useCanvasInspectorContext();
  const descriptor = elementPropertyDescriptor(name, target);
  if (!descriptor) return null;
  if (elements.length > 0 && !elements.every((element) => elementPropertyDescriptor(name, element)))
    return null;

  const rawValue = common(name);
  const isUnset =
    rawValue === undefined &&
    selected.length > 0 &&
    selected.every((element) => !(name in element) || Reflect.get(element, name) === undefined);
  const defaultValue = isUnset ? descriptor.defaultValue : rawValue;
  const isAuto = descriptor.allowAuto === true && defaultValue === "auto";
  const value = isAuto
    ? null
    : descriptor.toInput(variableInput(defaultValue, descriptor.targetType, variables, shapes));
  const type = inputType(descriptor.targetType);
  if (!type) return null;
  const availableVariables = variableOptions(descriptor.targetType, variables, shapes);

  return (
    <PropertyInput
      className={className}
      type={type}
      value={value}
      placeholder={isAuto ? "Auto" : placeholder}
      unit={descriptor.unit}
      step={descriptor.step}
      presets={presets}
      variables={availableVariables}
      allowAuto={descriptor.allowAuto}
      auto={isAuto}
      onAutoChange={
        descriptor.allowAuto
          ? (nextAuto) => update({ [name]: nextAuto ? descriptor.defaultValue : 0 })
          : undefined
      }
      icon={icon}
      min={descriptor.min}
      max={descriptor.max}
      onChange={(next) => {
        if (isVariableInput(next)) {
          update({
            [name]: {
              kind: "variable",
              variableId: next.id,
              fieldPath: next.fieldPath ?? [],
            },
          });
        } else if (next === null) {
          update({}, [name]);
        } else {
          update({ [name]: descriptor.fromInput(next.value) });
        }
      }}
    />
  );
};

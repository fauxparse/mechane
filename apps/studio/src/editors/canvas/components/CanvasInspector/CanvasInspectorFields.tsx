import { PropertyInput, type LucideIcon, type PropertyInputPreset } from "@mechane/design-system";
import {
  elementPropertyDescriptor,
  isElementPropertyFormulaable,
  type ElementPropertyDescriptor,
  type ElementPropertyName,
} from "@mechane/domain/element-properties";
import type { FormulaScope } from "@mechane/domain/formula";
import { formulaType } from "@mechane/domain/formula-runtime";
import { isPropertyConnection, isPropertyFormula } from "@mechane/domain/property-values";
import { useMemo } from "react";
import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import {
  elementFormulaScope,
  inputType,
  isVariableInput,
  variableInput,
  variableOptions,
} from "./canvas-inspector-values";
import {
  PropertyFormulaField,
  type PropertyFormulaBinding,
  type PropertyFormulaEntry,
} from "./PropertyFormulaField";

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
  const { focused, target, elements, selected, variables, shapes, common, update } =
    useCanvasInspectorContext();
  const descriptor = elementPropertyDescriptor(name, target);
  const formulaScope = useMemo<FormulaScope>(
    () =>
      elementFormulaScope(
        variables,
        shapes,
        descriptor ? formulaType(descriptor.targetType, shapes) : "unknown",
        { repeated: focused?.kind === "block" },
      ),
    [descriptor?.targetType, focused?.kind, shapes, variables],
  );
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

  const input = (entry?: PropertyFormulaEntry, inputClassName?: string) => (
    <PropertyInput
      className={inputClassName}
      type={type}
      value={value}
      placeholder={isAuto ? "Auto" : placeholder}
      unit={descriptor.unit}
      step={descriptor.step}
      presets={presets}
      variables={availableVariables}
      menuItems={entry?.menuItems}
      onMenuItemSelect={entry?.onMenuItemSelect}
      onKeyDown={entry?.onKeyDown}
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
              fallback: next.current?.value ?? descriptor.defaultValue,
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

  if (!isElementPropertyFormulaable(descriptor)) return input(undefined, className);

  const displayText = (raw: unknown): string => {
    const shown = descriptor.toInput(variableInput(raw, descriptor.targetType, variables, shapes));
    if (!shown || isVariableInput(shown)) return "—";
    return `${String(shown.value)}${descriptor.unit === "%" && shown.kind === "number" ? "%" : ""}`;
  };
  const binding: PropertyFormulaBinding = {
    label: propertyLabel(descriptor),
    icon,
    scope: formulaScope,
    formulaOf: (element) => {
      const stored: unknown = Reflect.get(element, name);
      return isPropertyFormula(stored) ? stored : null;
    },
    sourceOf: (formula) => formula.formula,
    restingText: (formula, analysis) => {
      const result = analysis.blocked ? null : analysis.value;
      return displayText(
        result?.kind === "number" || result?.kind === "text" || result?.kind === "boolean"
          ? result.value
          : formula.fallback,
      );
    },
    write: (element, source) => {
      const stored: unknown = Reflect.get(element, name);
      const fallback = isPropertyFormula(stored)
        ? stored.fallback
        : isPropertyConnection(stored)
          ? (stored.fallback ?? descriptor.defaultValue)
          : (stored ?? descriptor.defaultValue);
      return { [name]: { kind: "formula", formula: source, fallback } };
    },
    remove: (_element, formula) => ({ [name]: formula.fallback }),
  };

  return (
    <PropertyFormulaField binding={binding} className={className}>
      {input}
    </PropertyFormulaField>
  );
};

/** `fontSize` → `Font size`, for the Formula flyout's heading. */
function propertyLabel(descriptor: ElementPropertyDescriptor): string {
  const words = descriptor.name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

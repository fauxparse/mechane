import {
  PropertyInput,
  type LucideIcon,
  type PropertyInputPreset,
} from "@mechane/design-system";
import {
  absent,
  analyse,
  elementPropertyDescriptor,
  formulaShapeTable,
  formulaType,
  isElementPropertyFormulaable,
  isPropertyFormula,
  type ElementPropertyName,
  type FormulaScope,
} from "@mechane/domain";
import { useMemo, useState } from "react";
import { FormulaEditor } from "../../../show/graph/formula/FormulaEditor";
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
  const [formulaOpen, setFormulaOpen] = useState(false);
  const formulaScope = useMemo<FormulaScope>(
    () => ({
      ports: variables.flatMap((variable) =>
        variable.type
          ? [
              {
                name: variable.name,
                type: formulaType(variable.type, shapes),
                value: absent("the input is absent"),
              },
            ]
          : [],
      ),
      shapes: formulaShapeTable(shapes),
      expected: descriptor ? formulaType(descriptor.targetType, shapes) : "unknown",
      diagnosticSubject: "Element Property",
    }),
    [descriptor?.targetType, shapes, variables],
  );
  if (!descriptor) return null;
  if (elements.length > 0 && !elements.every((element) => elementPropertyDescriptor(name, element)))
    return null;
  const rawValue = common(name);
  const formula = isPropertyFormula(rawValue) ? rawValue : null;
  const formulaDiagnostics = formula
    ? analyse(formula.formula, formulaScope).diagnostics
    : [];
  const blockingFormulaDiagnostic = formulaDiagnostics.find(
    (diagnostic) => diagnostic.severity === "blocking",
  );
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
    <div className="flex min-w-0 flex-col gap-1">
      <PropertyInput
        className={className}
        type={type}
        value={value}
        placeholder={isAuto ? "Auto" : placeholder}
        unit={descriptor.unit}
        step={descriptor.step}
        presets={presets}
        variables={availableVariables}
        menuItems={
          isElementPropertyFormulaable(descriptor)
            ? [{ value: "formula", label: "Write formula" }]
            : undefined
        }
        onMenuItemSelect={(item) => {
          if (item === "formula") setFormulaOpen(true);
        }}
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
      {formulaOpen && isElementPropertyFormulaable(descriptor) ? (
        <FormulaEditor
          className="min-h-[4.5rem] text-xs"
          value={formula?.formula ?? ""}
          scope={formulaScope}
          autoFocus={!formula}
          onChange={(next) =>
            update({
              [name]: {
                kind: "formula",
                formula: next,
                fallback: formula?.fallback ?? descriptor.defaultValue,
              },
            })
          }
        />
      ) : null}
      {blockingFormulaDiagnostic ? (
        <p role="alert" className="text-xs text-destructive">
          {blockingFormulaDiagnostic.message}
        </p>
      ) : null}
    </div>
  );
};

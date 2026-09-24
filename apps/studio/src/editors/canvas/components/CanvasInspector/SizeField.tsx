import {
  materializePercentageChildrenForHug,
  type AxisSize,
  type Element,
} from "@mechane/domain/canvas";
import { joinFormulaUnit, splitFormulaUnit, type FormulaScope } from "@mechane/domain/formula";
import { isPropertyConnection, isPropertyFormula } from "@mechane/domain/property-values";
import type { PropertyInputConstraints } from "@mechane/design-system";
import { useMemo } from "react";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import {
  elementFormulaScope,
  variableOptions,
  type SizeConstraint,
} from "./canvas-inspector-values";
import {
  PropertyFormulaField,
  type PropertyFormulaBinding,
  type PropertyFormulaEntry,
} from "./PropertyFormulaField";
import { SizeFieldInput } from "./SizeFieldInput";

export type SizeFieldProps = {
  axis: "width" | "height";
  constraints?: PropertyInputConstraints;
  onConstraintToggle?: (constraint: SizeConstraint, enabled: boolean) => void;
};

function flattenSizing(elements: readonly Element[], into = new Map<string, unknown>()) {
  for (const element of elements) {
    into.set(element.id, element.sizing);
    flattenSizing(element.children ?? [], into);
  }
  return into;
}

export const SizeField = ({ axis, constraints, onConstraintToggle }: SizeFieldProps) => {
  const {
    focused,
    target,
    selected,
    common,
    variables,
    shapes,
    inspectorPreview,
    currentDimensions,
    currentDimensionsById,
    update,
    updateElements,
  } = useCanvasInspectorContext();
  const size = common(`sizing.${axis}`) as AxisSize | undefined;
  const formulaScope = useMemo<FormulaScope>(
    () =>
      elementFormulaScope(variables, shapes, "number", {
        allowsUnit: true,
        repeated: focused?.kind === "block",
      }),
    [focused?.kind, shapes, variables],
  );
  const sizeMixed =
    size === undefined && selected.some((element) => element.sizing?.[axis] !== undefined);
  const updateSize = (next: AxisSize) => {
    const nextSizing = { ...target.sizing, [axis]: next };
    if (next.mode === "hug" && target.type === "frame" && updateElements && currentDimensionsById) {
      const converted = materializePercentageChildrenForHug(
        { ...target, sizing: nextSizing },
        currentDimensionsById,
      );
      const before = flattenSizing(target.children ?? []);
      const after = flattenSizing(converted.children ?? []);
      const updates = [
        { elementId: target.id, properties: { sizing: nextSizing } },
        ...[...after].flatMap(([elementId, sizing]) =>
          JSON.stringify(before.get(elementId)) === JSON.stringify(sizing)
            ? []
            : [{ elementId, properties: { sizing } as Record<string, unknown> }],
        ),
      ];
      updateElements(updates);
      return;
    }
    update({ sizing: nextSizing });
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
  const input = (entry?: PropertyFormulaEntry) => (
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
      entry={entry}
    />
  );
  // A drag on the Artboard previews literal pixels over whatever is stored.
  if (previewing) return input();

  const measured = (element: Element) =>
    currentDimensionsById?.[element.id]?.[axis] ??
    (currentDimensions?.elementId === element.id ? currentDimensions[axis] : undefined) ??
    0;
  const binding: PropertyFormulaBinding = {
    label: axis === "width" ? "Width" : "Height",
    icon: axis === "width" ? "W" : "H",
    scope: formulaScope,
    formulaOf: (element) => {
      const stored = element.sizing?.[axis]?.value;
      return isPropertyFormula(stored) ? stored : null;
    },
    sourceOf: (formula) => joinFormulaUnit(formula.formula, formula.unit),
    restingText: (formula, analysis) => {
      const result = analysis.blocked ? null : analysis.value;
      if (result?.kind === "number")
        return `${Math.round(result.value * 10) / 10}${formula.unit === "%" ? "%" : ""}`;
      const fallback = formula.fallback;
      if (typeof fallback === "number") return String(fallback);
      if (fallback && typeof fallback === "object" && "value" in fallback && "unit" in fallback)
        return `${String(fallback.value)}${fallback.unit === "%" ? "%" : ""}`;
      return "—";
    },
    resultSuffix: (source) => (splitFormulaUnit(source).unit === "%" ? "%" : ""),
    write: (element, source) => {
      const typed = splitFormulaUnit(source);
      const current = element.sizing?.[axis];
      const stored = current?.value;
      const fallback = isPropertyFormula(stored)
        ? stored.fallback
        : isPropertyConnection(stored)
          ? (stored.fallback ?? measured(element))
          : (stored ?? measured(element));
      return {
        sizing: {
          ...element.sizing,
          [axis]: {
            ...current,
            mode: "fixed",
            value: { kind: "formula", formula: typed.formula, fallback, unit: typed.unit },
          },
        },
      };
    },
    remove: (element, formula) => ({
      sizing: {
        ...element.sizing,
        [axis]: {
          ...element.sizing?.[axis],
          mode: "fixed",
          value: formula.fallback ?? measured(element),
        },
      },
    }),
  };
  return <PropertyFormulaField binding={binding}>{input}</PropertyFormulaField>;
};

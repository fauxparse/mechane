import {
  isPropertyFormula,
  materializePercentageChildrenForHug,
  absent,
  formulaShapeTable,
  formulaType,
  type AxisSize,
  type Element,
  type FormulaScope,
} from "@mechane/domain";
import type { PropertyInputConstraints } from "@mechane/design-system";
import { useMemo, useState } from "react";

import { FormulaEditor } from "../../../show/graph/formula/FormulaEditor";
import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { variableOptions, type SizeConstraint } from "./canvas-inspector-values";
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
      expected: "number",
      diagnosticSubject: "Element Property",
    }),
    [shapes, variables],
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
  const formula =
    previewing || sizeMixed ? null : isPropertyFormula(size?.value) ? size.value : null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
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
        formula={formula}
        sizeVariables={sizeVariables}
        shapes={shapes}
        updateSize={updateSize}
        onWriteFormula={() => setFormulaOpen(true)}
      />
      {formulaOpen || formula ? (
        <FormulaEditor
          className="min-h-[4.5rem] text-xs"
          value={formula?.formula ?? ""}
          scope={formulaScope}
          autoFocus={!formula}
          onChange={(next) =>
            updateSize({
              ...(sizeMixed ? {} : size),
              mode: "fixed",
              value: {
                kind: "formula",
                formula: next,
                fallback: { value: currentValue ?? 0, unit },
                unit,
              },
            })
          }
        />
      ) : null}
    </div>
  );
};

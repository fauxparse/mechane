import { useState } from "react";
import type { AxisSize, SlotInputSource } from "@mechane/domain";
import { CANVAS_PROPERTY_DESCRIPTORS, canvasPropertyDescriptor } from "@mechane/domain";
import {
  Link2Icon,
  PropertyInput,
  Section,
  SectionRow,
  Toggle,
  Unlink2Icon,
  type LucideIcon,
  type PropertyInputConstraints,
  type PropertyInputPreset,
  type PropertyInputValue,
} from "@mechane/design-system";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import {
  inputType,
  isVariableInput,
  literalValue,
  sizeInputValue,
  sizeValueNumber,
  sizeValueUnit,
  sizeConstraintKey,
  sizingForMode,
  slotInputOptions,
  slotInputReference,
  variableInput,
  variableOptions,
  type SizeConstraint,
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
  const { target, elements, selected, variables, shapes, common, update } =
    useCanvasInspectorContext();
  const descriptor = canvasPropertyDescriptor(name, target);
  if (!descriptor) return null;
  if (elements.length > 0 && !elements.every((element) => canvasPropertyDescriptor(name, element)))
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

export const SlotInputsSection = () => {
  const { target, blocks, variables, shapes, update } = useCanvasInspectorContext();
  if (target.type !== "slot") return null;
  const block = blocks.find((candidate) => candidate.id === target.blockId);
  if (!block) return null;
  const assignments = target.assignments ?? [];
  const updateAssignment = (variableId: string, source: SlotInputSource) => {
    update({
      assignments: [
        ...assignments.filter((assignment) => assignment.variableId !== variableId),
        { variableId, source },
      ],
    });
  };
  return (
    <Section label="Block Inputs">
      {block.variables.map((variable) => {
        const assignment = assignments.find((item) => item.variableId === variable.id);
        const type = inputType(variable.type);
        const value =
          type !== null
            ? assignment?.source?.kind === "variable"
              ? variableInput(
                  {
                    kind: "variable",
                    variableId: assignment.source.variableId,
                    fieldPath: assignment.source.fieldPath ?? [],
                  },
                  variable.type,
                  variables,
                  shapes,
                )
              : assignment?.source?.kind === "literal"
                ? literalValue(variable.type, assignment.source.value)
                : null
            : slotInputReference(target, variable, assignment?.source, variables, shapes);
        const options =
          type !== null
            ? variableOptions(variable.type, variables, shapes)
            : slotInputOptions(target, variable, variables, shapes);
        if (type === null && value === null && options.length === 0) return null;
        return (
          <SectionRow key={variable.id}>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {variable.name}
            </span>
            <PropertyInput
              className="min-w-0 flex-1"
              type={type ?? "text"}
              value={value}
              variables={options}
              onChange={(next: PropertyInputValue | null) => {
                const runtimeReference =
                  type === null
                    ? slotInputReference(
                        target,
                        variable,
                        { kind: "runtimeItem" },
                        variables,
                        shapes,
                      )
                    : null;
                const nextSource: SlotInputSource = isVariableInput(next)
                  ? runtimeReference &&
                    next.id === runtimeReference.id &&
                    JSON.stringify(next.fieldPath ?? []) ===
                      JSON.stringify(runtimeReference.fieldPath ?? [])
                    ? { kind: "runtimeItem" }
                    : {
                        kind: "variable",
                        variableId: next.id,
                        fieldPath: next.fieldPath ?? [],
                      }
                  : next
                    ? type === null
                      ? (assignment?.source ?? { kind: "unset" })
                      : { kind: "literal", value: next.value }
                    : { kind: "unset" };
                updateAssignment(variable.id, nextSource);
              }}
            />
          </SectionRow>
        );
      })}
    </Section>
  );
};

const AXES = ["width", "height"] as const;
const CONSTRAINTS = ["min", "max"] as const;
const CONSTRAINT_ICONS: Record<SizeConstraint, string> = { min: "≥", max: "≤" };

type SizeFieldProps = {
  axis: "width" | "height";
  constraints?: PropertyInputConstraints;
  onConstraintToggle?: (constraint: SizeConstraint, enabled: boolean) => void;
};

const SizeField = ({ axis, constraints, onConstraintToggle }: SizeFieldProps) => {
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
    <PropertyInput
      icon={axis === "width" ? "W" : "H"}
      type="number"
      dimension={axis}
      unit={unit}
      placeholder={
        sizeMixed ? "Mixed" : mode === "fill" ? "Fill" : mode === "hug" ? "Hug" : undefined
      }
      value={
        previewing
          ? literalValue("number", previewValue)
          : sizeMixed
            ? null
            : sizeInputValue(size, sizeVariables, shapes)
      }
      sizing={mode}
      variables={sizeVariables}
      min={0}
      constraints={constraints}
      onConstraintToggle={onConstraintToggle}
      onSizingChange={(nextMode) => {
        updateSize(sizingForMode(sizeMixed ? undefined : size, nextMode, currentValue));
      }}
      onChange={(next: PropertyInputValue | null) => {
        if (isVariableInput(next)) {
          updateSize({
            ...(sizeMixed ? {} : size),
            mode: "fixed",
            value: {
              kind: "variable",
              variableId: next.id,
              fieldPath: next.fieldPath ?? [],
            },
          });
        } else if (next?.kind === "number") {
          updateSize({
            ...(sizeMixed ? {} : size),
            mode: "fixed",
            value: unit === "%" ? { value: next.value, unit } : next.value,
          });
        }
      }}
    />
  );
};

type SizeConstraintFieldProps = {
  axis: "width" | "height";
  constraint: SizeConstraint;
};

const SizeConstraintField = ({ axis, constraint }: SizeConstraintFieldProps) => {
  const { target, update } = useCanvasInspectorContext();
  const key = sizeConstraintKey(axis, constraint);
  const stored = target.sizing?.[key];
  const unit = sizeValueUnit(stored);
  const value = sizeValueNumber(stored);
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

/**
 * Width/height inputs plus the min/max constraints the user has revealed from
 * each dimension's menu. Constraints stay hidden until requested (Figma-style).
 */
export const SizeFields = () => {
  const {
    target,
    inspectorPreview,
    currentDimensions,
    update,
    isAspectRatioLocked,
    setAspectRatioLock,
  } = useCanvasInspectorContext();
  const [revealed, setRevealed] = useState<Partial<Record<string, boolean>>>({});

  const isRevealed = (axis: "width" | "height", constraint: SizeConstraint) =>
    revealed[`${axis}.${constraint}`] ??
    target.sizing?.[sizeConstraintKey(axis, constraint)] !== undefined;

  const constraintsFor = (axis: "width" | "height"): PropertyInputConstraints => ({
    min: isRevealed(axis, "min"),
    max: isRevealed(axis, "max"),
  });

  const computedSize = (axis: "width" | "height") => {
    if (inspectorPreview?.elementId === target.id && inspectorPreview[axis] !== undefined)
      return inspectorPreview[axis];
    if (currentDimensions?.elementId === target.id) return currentDimensions[axis];
    return sizeValueNumber(target.sizing?.[axis]?.value) ?? undefined;
  };

  const toggleConstraint = (
    axis: "width" | "height",
    constraint: SizeConstraint,
    enabled: boolean,
  ) => {
    const key = sizeConstraintKey(axis, constraint);
    setRevealed((current) => ({ ...current, [`${axis}.${constraint}`]: enabled }));
    const nextValue = enabled ? (constraint === "min" ? 0 : computedSize(axis)) : undefined;
    update({ sizing: { ...target.sizing, [key]: nextValue } });
  };

  const hasConstraints = AXES.some((axis) =>
    CONSTRAINTS.some((constraint) => isRevealed(axis, constraint)),
  );

  return (
    <>
      <SectionRow>
        {AXES.map((axis) => (
          <SizeField
            key={axis}
            axis={axis}
            constraints={constraintsFor(axis)}
            onConstraintToggle={(constraint, enabled) =>
              toggleConstraint(axis, constraint, enabled)
            }
          />
        ))}
        <Toggle
          aria-label={`${isAspectRatioLocked ? "Unlock" : "Lock"} aspect ratio`}
          pressed={isAspectRatioLocked}
          onPressedChange={setAspectRatioLock}
        >
          {isAspectRatioLocked ? <Link2Icon /> : <Unlink2Icon />}
        </Toggle>
      </SectionRow>
      {hasConstraints && (
        <SectionRow>
          {AXES.map((axis) => (
            <div key={axis} className="flex flex-col gap-2">
              {CONSTRAINTS.map((constraint) =>
                isRevealed(axis, constraint) ? (
                  <SizeConstraintField key={constraint} axis={axis} constraint={constraint} />
                ) : null,
              )}
            </div>
          ))}
        </SectionRow>
      )}
    </>
  );
};

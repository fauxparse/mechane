import { useState } from "react";
import type { AxisSize, SceneVariable } from "@mechane/domain";
import {
  CANVAS_PROPERTY_DESCRIPTORS,
  canvasPropertyDescriptor,
  opacityFromPercent,
  propertyCoercion,
} from "@mechane/domain";
import {
  Link2Icon,
  PropertyInput,
  Toggle,
  Unlink2Icon,
  type LucideIcon,
  type PropertyInputConstraints,
  type PropertyInputPreset,
  type PropertyInputValue,
} from "@mechane/design-system";

import { SectionRow } from "./Section";
import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import {
  inputType,
  isVariableInput,
  literalValue,
  opacityInputValue,
  sizeConstraintKey,
  sizeInputValue,
  sizeValueNumber,
  sizeValueUnit,
  sizingForMode,
  variableInput,
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

const AXES = ["width", "height"] as const;
const CONSTRAINTS = ["min", "max"] as const;
const CONSTRAINT_ICONS: Record<SizeConstraint, string> = { min: "≥", max: "≤" };

type SizeFieldProps = {
  axis: "width" | "height";
  constraints?: PropertyInputConstraints;
  onConstraintToggle?: (constraint: SizeConstraint, enabled: boolean) => void;
};

export const SizeField = ({ axis, constraints, onConstraintToggle }: SizeFieldProps) => {
  const { target, variables, inspectorPreview, currentDimensions, update } =
    useCanvasInspectorContext();
  const size = target.sizing?.[axis];
  const updateSize = (next: AxisSize) => {
    update({ sizing: { ...target.sizing, [axis]: next } });
  };
  const previewValue =
    inspectorPreview?.elementId === target.id ? inspectorPreview[axis] : undefined;
  const currentValue =
    previewValue ??
    (currentDimensions?.elementId === target.id ? currentDimensions[axis] : undefined);
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
      constraints={constraints}
      onConstraintToggle={onConstraintToggle}
      onSizingChange={(nextMode) => {
        updateSize(sizingForMode(size, nextMode, currentValue));
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
          size="sm"
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

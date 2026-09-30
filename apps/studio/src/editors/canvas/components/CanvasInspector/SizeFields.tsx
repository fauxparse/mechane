import { Link2Icon, SectionRow, Toggle, Unlink2Icon } from "@mechane/design-system";
import type { PropertyInputConstraints } from "@mechane/design-system";
import { useState } from "react";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { sizeConstraintKey, sizeValueNumber, type SizeConstraint } from "./canvas-inspector-values";
import { SizeConstraintField } from "./SizeConstraintField";
import { SizeField } from "./SizeField";

const AXES = ["width", "height"] as const;
const CONSTRAINTS = ["min", "max"] as const;

/** Filled Scene-root axes require minimum inputs for editor preview dimensions. */
export const SizeFields = () => {
  const {
    focused,
    target,
    selected,
    inspectorPreview,
    currentDimensions,
    update,
    isAspectRatioLocked,
    setAspectRatioLock,
  } = useCanvasInspectorContext();
  const [revealed, setRevealed] = useState<Partial<Record<string, boolean>>>({});

  const fillsSceneRootAxis = (axis: "width" | "height") =>
    focused?.kind === "scene" &&
    selected.length === 1 &&
    selected[0]?.id === focused.canvas.root.id &&
    target.sizing?.[axis]?.mode === "fill";

  const isRevealed = (axis: "width" | "height", constraint: SizeConstraint) =>
    (constraint === "min" && fillsSceneRootAxis(axis)) ||
    (revealed[`${axis}.${constraint}`] ??
      target.sizing?.[sizeConstraintKey(axis, constraint)] !== undefined);

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
    if (!enabled && constraint === "min" && fillsSceneRootAxis(axis)) return;
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
                  <SizeConstraintField
                    key={constraint}
                    axis={axis}
                    constraint={constraint}
                    fallback={
                      constraint === "min" && fillsSceneRootAxis(axis)
                        ? computedSize(axis)
                        : undefined
                    }
                  />
                ) : null,
              )}
            </div>
          ))}
        </SectionRow>
      )}
    </>
  );
};

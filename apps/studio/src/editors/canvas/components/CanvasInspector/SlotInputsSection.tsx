import {
  PropertyInput,
  Section,
  SectionRow,
  type PropertyInputValue,
} from "@mechane/design-system";
import type { SlotInputSource } from "@mechane/domain";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import {
  inputType,
  isVariableInput,
  literalValue,
  slotInputOptions,
  slotInputReference,
  variableInput,
  variableOptions,
} from "./canvas-inspector-values";

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

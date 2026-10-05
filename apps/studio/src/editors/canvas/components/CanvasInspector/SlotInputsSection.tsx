import {
  PropertyInput,
  Section,
  SectionHelperText,
  SectionRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type PropertyInputValue,
} from "@mechane/design-system";
import type { SlotInputSource } from "@mechane/domain/canvas";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import {
  inputType,
  isVariableInput,
  literalValue,
  slotExpansionOptions,
  slotInputOptions,
  slotInputReference,
} from "./canvas-inspector-values";

const sourceKey = (source: SlotInputSource): string =>
  source.kind === "variable"
    ? JSON.stringify([source.kind, source.variableId, source.fieldPath ?? []])
    : source.kind === "runtimeItem"
      ? JSON.stringify([source.kind, source.fieldPath ?? []])
      : source.kind;

export const SlotInputsSection = () => {
  const { target, blocks, variables, shapes, update } = useCanvasInspectorContext();
  if (target.type !== "slot") return null;
  const block = blocks.find((candidate) => candidate.id === target.blockId);
  if (!block) return null;
  const assignments = target.assignments ?? [];
  const expansionOptions = slotExpansionOptions(variables, shapes);
  const expansionSource = target.expansion?.source;
  const expansionKey = expansionSource ? sourceKey(expansionSource) : "none";
  const expansionUnavailable = Boolean(
    expansionSource &&
    !expansionOptions.some((option) => sourceKey(option.source) === expansionKey),
  );
  const repeatItems = [
    { value: "none", label: "Don't repeat" },
    ...expansionOptions.map((option) => ({
      value: sourceKey(option.source),
      label: option.name,
    })),
    ...(expansionUnavailable ? [{ value: expansionKey, label: "Unavailable source" }] : []),
  ];
  const updateAssignment = (variableId: string, source: SlotInputSource) => {
    update({
      assignments: [
        ...assignments.filter((assignment) => assignment.variableId !== variableId),
        { variableId, source },
      ],
    });
  };
  return (
    <>
      <Section label="Repeat">
        <SectionRow className="grid-cols-[1fr]">
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">Source</span>
          <Select
            items={repeatItems}
            value={expansionKey}
            onValueChange={(key) => {
              if (key === "none") {
                update(
                  {
                    assignments: assignments.map((assignment) =>
                      assignment.source.kind === "runtimeItem"
                        ? { variableId: assignment.variableId, source: { kind: "unset" } }
                        : assignment,
                    ),
                  },
                  ["expansion"],
                );
                return;
              }
              const option = expansionOptions.find(
                (candidate) => sourceKey(candidate.source) === key,
              );
              if (option) update({ expansion: { source: option.source } });
            }}
          >
            <SelectTrigger aria-label="Repeat source" className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {repeatItems.map((item) => (
                <SelectItem
                  key={item.value}
                  value={item.value}
                  disabled={expansionUnavailable && item.value === expansionKey}
                >
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SectionRow>
        <SectionHelperText>
          Render one Block per array item, then map its inputs to Current item.
        </SectionHelperText>
      </Section>
      <Section label="Block Inputs">
        {block.variables.map((variable) => {
          const assignment = assignments.find((item) => item.variableId === variable.id);
          const type = inputType(variable.type);
          const options = slotInputOptions(target, variable, variables, shapes);
          const reference = slotInputReference(
            target,
            variable,
            assignment?.source,
            variables,
            shapes,
          );
          const value =
            assignment?.source.kind === "literal"
              ? literalValue(variable.type, assignment.source.value)
              : reference;
          const selectedKey = assignment?.source ? sourceKey(assignment.source) : "unset";
          const selectedOption = options.find((option) => sourceKey(option.source) === selectedKey);
          const inputUnavailable = selectedKey !== "unset" && !selectedOption;
          const inputItems = [
            { value: "unset", label: "Default / unset" },
            ...options.map((option) => ({ value: sourceKey(option.source), label: option.name })),
            ...(inputUnavailable
              ? [
                  {
                    value: selectedKey,
                    label:
                      assignment?.source.kind === "literal"
                        ? "Literal value"
                        : (reference?.name ?? "Unavailable input"),
                  },
                ]
              : []),
          ];
          return (
            <SectionRow key={variable.id} className="grid-cols-[1fr]">
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {variable.name}
              </span>
              {type !== null ? (
                <PropertyInput
                  className="min-w-0 flex-1"
                  ariaLabel={`${variable.name} input`}
                  type={type}
                  value={value}
                  variables={options}
                  brokenVariable={Boolean(reference && !selectedOption)}
                  onChange={(next: PropertyInputValue | null) => {
                    if (isVariableInput(next)) {
                      const option = options.find(
                        (candidate) =>
                          candidate.id === next.id &&
                          JSON.stringify(candidate.fieldPath ?? []) ===
                            JSON.stringify(next.fieldPath ?? []),
                      );
                      if (option) updateAssignment(variable.id, option.source);
                    } else {
                      updateAssignment(
                        variable.id,
                        next ? { kind: "literal", value: next.value } : { kind: "unset" },
                      );
                    }
                  }}
                />
              ) : (
                <Select
                  items={inputItems}
                  value={selectedKey}
                  onValueChange={(key) => {
                    if (key === "unset") {
                      updateAssignment(variable.id, { kind: "unset" });
                      return;
                    }
                    const option = options.find((candidate) => sourceKey(candidate.source) === key);
                    if (option) updateAssignment(variable.id, option.source);
                  }}
                >
                  <SelectTrigger
                    aria-label={`${variable.name} input source`}
                    className="w-full min-w-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {inputItems.map((item) => (
                      <SelectItem
                        key={item.value}
                        value={item.value}
                        disabled={inputUnavailable && item.value === selectedKey}
                      >
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </SectionRow>
          );
        })}
      </Section>
    </>
  );
};

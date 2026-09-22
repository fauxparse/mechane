// PROTOTYPE (issue #675) — Variant A: "In the inspector".
//
// Thesis: the Formula is just another inspector field, so it goes where every
// other authored value goes. The editor is a CodeMirror the width of the
// sidebar, sitting under the Inputs section #676 settled, with the live result
// directly beneath it and the inputs' current values above it. Nothing leaves
// the sidebar; the canvas never moves.
//
// The bet: a director who can see the inputs, the Formula and the answer in one
// narrow column does not need anywhere else to go. The risk is the column:
// every diagnostic, every completion and every value is living in ~250px.
import {
  Button,
  Section,
  SectionHelperText,
  SectionRow,
  ShuffleIcon,
  TypeSelect,
  cn,
  useToastManager,
  variableTypeIcon,
} from "@mechane/design-system";
import { typeLabel, type Type } from "@mechane/domain";
import { Position } from "@xyflow/react";
import { useMemo } from "react";

import {
  VariableInspector,
  type VariableInspectorEditing,
} from "../../../../components/VariableInspector";
import { handleFor } from "../handle-ids";
import { HANDLE_CLASS } from "../handle-styles";
import { FormulaEditor } from "./FormulaEditor";
import { previewText, typeName, type FormulaScope } from "./formula-language";
import {
  PROTOTYPE_SHAPES,
  formulaType,
  prototypeActions,
  type PrototypeTransform,
} from "./formula-state";
import {
  portWarnings,
  shortValue,
  useAnalysis,
  usePortHandles,
  type VariantInspectorProps,
  type VariantNodeProps,
} from "./variant-parts";

export function VariantANodeBody({
  nodeId,
  transform,
  handle: HandleComponent,
  connectedHandleIds,
  targetable,
}: VariantNodeProps) {
  usePortHandles(nodeId, transform);
  const analysis = useAnalysis(transform);
  const OutputIcon = variableTypeIcon(transform.outputType);
  const warnings = portWarnings(transform);
  const blocking = analysis.formula?.diagnostics.filter((d) => d.severity === "blocking") ?? [];

  return (
    <>
      <div className="grid grid-cols-[2.5rem_1fr] gap-x-2">
        {transform.ports.map((port) => {
          const Icon = variableTypeIcon(port.type);
          const handleId = handleFor({ kind: "field", id: port.id });
          const warned = warnings.some((warning) => warning.portId === port.id);
          return (
            <div
              key={port.id}
              className="border-t border-(--flow-border)/50 relative grid col-span-full grid-cols-subgrid items-center py-1.5"
            >
              <HandleComponent
                id={handleId}
                type="target"
                position={Position.Left}
                className={HANDLE_CLASS}
                data-targetable={targetable}
                data-connected={connectedHandleIds.has(handleId)}
                isConnectableStart={false}
              />
              <Icon
                className={cn(
                  "size-4 shrink-0 justify-self-center ml-2",
                  warned ? "text-destructive" : "text-(--flow-muted-foreground)",
                )}
              />
              <div className="flex min-w-0 items-baseline justify-between gap-2 pr-3">
                <span className="truncate font-mono text-xs">{port.name}</span>
                <span className="truncate text-[10px] text-(--flow-muted-foreground)">
                  {port.wiredFrom ? shortValue(port.value, 18) : "not connected"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-(--flow-border)/50 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide text-(--flow-muted-foreground)">
          {transform.kind === "filter"
            ? "keep when"
            : transform.kind === "shuffle"
              ? "order"
              : "formula"}
        </div>
        {/* #676 left this open: at 240px a Formula worth reading truncates. A
            keeps the line anyway, on the bet that its shape is recognisable. */}
        <div
          className={cn("truncate font-mono text-xs", blocking.length > 0 && "text-destructive")}
        >
          {transform.kind === "shuffle"
            ? `shuffled · seed ${transform.seed}`
            : transform.formula || "—"}
        </div>
      </div>

      <div
        className={cn(
          "border-t border-(--flow-border)/50 grid grid-cols-[2.5rem_1fr] gap-x-2 items-center py-1.5",
          blocking.length > 0 && "bg-destructive/10",
        )}
      >
        <OutputIcon
          className={cn(
            "size-4 shrink-0 justify-self-center ml-2",
            blocking.length > 0 ? "text-destructive" : "text-(--flow-muted-foreground)",
          )}
        />
        <div className="flex min-w-0 items-baseline justify-between gap-2 pr-3">
          <span className={cn("truncate text-xs", blocking.length > 0 && "text-destructive")}>
            {blocking.length > 0 ? "won't publish" : shortValue(analysis.output, 22)}
          </span>
          <span className="shrink-0 text-[10px] text-(--flow-muted-foreground)">
            {transform.derivedTypeLabel ? "from input" : typeLabel(transform.outputType)}
          </span>
        </div>
      </div>
    </>
  );
}

export function VariantAInspector({ node, transform, shapes }: VariantInspectorProps) {
  const toasts = useToastManager();
  const analysis = useAnalysis(transform);
  const scope = useScope(transform);

  const editing = useMemo<VariableInspectorEditing>(
    () => ({
      addVariable: () => prototypeActions.addPort(node.id),
      renameVariable: (portId, name) => {
        const port = transform.ports.find((candidate) => candidate.id === portId);
        const references = prototypeActions.renamePort(node.id, portId, name);
        if (!port) return;
        toasts.add({
          title: `Renamed ${port.name} to ${name}`,
          description:
            references === 0
              ? "The Formula didn't mention it."
              : `${references} ${references === 1 ? "reference" : "references"} in the Formula updated.`,
          actionProps: {
            children: "Undo",
            onClick: () => prototypeActions.renamePort(node.id, portId, port.name),
          },
        });
      },
      setVariableType: (portId, type) => prototypeActions.setPortType(node.id, portId, type),
      setVariableDefault: () => undefined,
      reorderVariables: (portIds) => prototypeActions.reorderPorts(node.id, portIds),
      removeVariable: (portId) => prototypeActions.removePort(node.id, portId),
    }),
    [node.id, toasts, transform.ports],
  );

  const warnings = portWarnings(transform);

  return (
    <>
      {transform.kind === "calculate" ? (
        <VariableInspector
          variables={transform.ports}
          editing={editing}
          shapes={shapes}
          label="Inputs"
          addLabel="Add Input"
        />
      ) : (
        <Section label="Input">
          <SectionRow className="grid-cols-[1fr]">
            <div className="flex items-center justify-between gap-2 rounded-sm border border-input px-2 py-1.5 text-xs">
              <span className="font-mono">{transform.ports[0]?.name}</span>
              <span className="text-muted-foreground">
                {transform.ports[0]?.wiredFrom ?? "not connected"}
              </span>
            </div>
          </SectionRow>
          <SectionHelperText>
            {transform.kind === "filter" ? "A Filter" : "A Shuffle"} has exactly one input. It can't
            be renamed, reordered or removed.
          </SectionHelperText>
        </Section>
      )}

      {/* The inputs' live values: the thing a static Type can't tell you. */}
      {transform.ports.length > 0 ? (
        <Section label="Reading now">
          {transform.ports.map((port) => (
            <SectionRow key={port.id} className="grid-cols-[1fr]">
              <div className="flex min-w-0 items-baseline justify-between gap-2 text-xs">
                <span className="font-mono text-(--color-palette-blue-text)">{port.name}</span>
                <span
                  className={cn(
                    "truncate text-right",
                    port.value.kind === "absent" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {port.value.kind === "absent" ? "nothing" : shortValue(port.value, 26)}
                </span>
              </div>
            </SectionRow>
          ))}
        </Section>
      ) : null}

      {transform.kind === "shuffle" ? (
        <Section label="Order">
          <SectionRow className="grid-cols-[1fr_auto] items-center">
            <span className="font-mono text-xs">seed {transform.seed}</span>
            <Button size="sm" variant="outline" onClick={() => prototypeActions.reshuffle(node.id)}>
              <ShuffleIcon />
              Reshuffle
            </Button>
          </SectionRow>
          <SectionHelperText>
            One seed per Run, or per Device Instance inside a Flow. Reshuffling replaces it for the
            Run that's live now.
          </SectionHelperText>
        </Section>
      ) : (
        <Section label={transform.kind === "filter" ? "Keep when" : "Formula"}>
          <SectionRow className="grid-cols-[1fr]">
            <FormulaEditor
              className="col-span-full min-h-[4.5rem]"
              value={transform.formula}
              scope={scope}
              onChange={(next) => prototypeActions.setFormula(node.id, next)}
              placeholder={transform.kind === "filter" ? "item.votes >= 10" : "Write a Formula…"}
            />
          </SectionRow>

          {/* The result, one line below the source: the sidebar's whole bet. */}
          <SectionRow className="grid-cols-[auto_1fr] items-baseline gap-2">
            <span className="font-mono text-xs text-muted-foreground">=</span>
            <span
              className={cn(
                "min-w-0 truncate text-xs",
                analysis.blocked ? "text-destructive" : "text-foreground",
              )}
            >
              {analysis.blocked ? "can't be evaluated yet" : previewText(analysis.output)}
            </span>
          </SectionRow>

          {analysis.formula && analysis.formula.diagnostics.length > 0 ? (
            <SectionRow className="grid-cols-[1fr]">
              <ul className="space-y-1">
                {analysis.formula.diagnostics.map((diagnostic, index) => (
                  <li
                    key={`${diagnostic.category}-${index}`}
                    className={cn(
                      "text-xs leading-snug",
                      diagnostic.severity === "blocking"
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {diagnostic.message}
                  </li>
                ))}
              </ul>
            </SectionRow>
          ) : null}

          <SectionHelperText>
            {transform.kind === "filter"
              ? "Runs once per item, with the item as `item`. Must answer true or false."
              : `Reads the Inputs above by name. Ctrl+Space for the list.`}
          </SectionHelperText>
        </Section>
      )}

      <Section label="Output">
        {transform.derivedTypeLabel ? (
          <SectionRow className="grid-cols-[1fr]">
            <span className="text-xs text-muted-foreground">{transform.derivedTypeLabel}</span>
          </SectionRow>
        ) : (
          <SectionRow className="grid-cols-[1fr]">
            <TypeSelect
              value={transform.outputType}
              shapes={shapes}
              includeArray
              aria-label="Output Type"
              onValueChange={(type: Type) => prototypeActions.setOutputType(node.id, type)}
            />
          </SectionRow>
        )}
        <SectionHelperText>
          Now: {previewText(analysis.output)}
          {analysis.formula && !analysis.blocked ? ` · ${typeName(analysis.formula.type)}` : ""}
        </SectionHelperText>
      </Section>

      {warnings.length > 0 ? (
        <Section label="Needs attention">
          {warnings.map((warning) => (
            <SectionRow key={warning.portId} className="grid-cols-[1fr]">
              <span className="text-xs text-destructive">{warning.message}</span>
            </SectionRow>
          ))}
        </Section>
      ) : null}
    </>
  );
}

/** The scope the editor checks and completes against. */
export function useScope(transform: PrototypeTransform): FormulaScope {
  return useMemo(
    () => ({
      ports: transform.ports.map((port) => ({
        name: port.name,
        type: formulaType(port.type),
        value: port.value,
      })),
      shapes: PROTOTYPE_SHAPES,
      expected: transform.kind === "filter" ? "boolean" : formulaType(transform.outputType),
      itemBinding:
        transform.kind === "filter"
          ? {
              name: "item",
              type: { record: "Candidate" },
              value:
                transform.ports[0]?.value.kind === "array"
                  ? (transform.ports[0]?.value.items[0] ?? {
                      kind: "absent",
                      because: "the input is empty",
                    })
                  : { kind: "absent", because: "the input is empty" },
            }
          : undefined,
    }),
    [transform],
  );
}

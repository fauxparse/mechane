// PROTOTYPE (issue #675) — Variant C: "On the node, like a sheet".
//
// Thesis: the audience's model of a formula is a spreadsheet, so make the node
// the sheet. Selecting a Transformer turns its body into an `fx` bar with the
// input values laid out as a small grid beneath it and the result on the bottom
// row, all in place on the canvas, next to the wires that feed it. Nothing
// opens, nothing moves, and the inspector holds only the ports and the Type.
//
// The bet: editing beside the wiring is worth more than editing beside the
// other inspector fields. The risk is the canvas — React Flow owns drag, zoom
// and the keyboard there, and a node that grows shoves its neighbours around.
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
import { useScope } from "./VariantA";
import { asText, previewText, type FormulaValue } from "./formula-language";
import { prototypeActions } from "./formula-state";
import {
  portWarnings,
  useAnalysis,
  usePortHandles,
  type VariantInspectorProps,
  type VariantNodeProps,
} from "./variant-parts";

export function VariantCNodeBody({
  nodeId,
  transform,
  handle: HandleComponent,
  connectedHandleIds,
  targetable,
  selected,
}: VariantNodeProps) {
  usePortHandles(nodeId, transform);
  const analysis = useAnalysis(transform);
  const scope = useScope(transform);
  const warnings = portWarnings(transform);
  const diagnostics = analysis.formula?.diagnostics ?? [];
  const blocking = diagnostics.filter((diagnostic) => diagnostic.severity === "blocking");
  const OutputIcon = variableTypeIcon(transform.outputType);

  return (
    <>
      {/* The fx bar: the Formula, on the node, editable in place when selected. */}
      {transform.kind !== "shuffle" ? (
        <div className="border-t border-(--flow-border)/50 flex items-start gap-2 px-2 py-1.5">
          <span className="mt-1 font-mono text-[11px] italic text-(--flow-muted-foreground)">
            fx
          </span>
          {selected ? (
            <FormulaEditor
              className="min-w-0 flex-1 bg-background"
              value={transform.formula}
              scope={scope}
              onChange={(next) => prototypeActions.setFormula(nodeId, next)}
              placeholder={transform.kind === "filter" ? "item.votes >= 10" : "Write a Formula…"}
            />
          ) : (
            <span
              className={cn(
                "min-w-0 flex-1 break-words font-mono text-[11px] leading-snug",
                blocking.length > 0 && "text-destructive underline decoration-wavy",
              )}
            >
              {transform.formula || "—"}
            </span>
          )}
        </div>
      ) : (
        <div className="border-t border-(--flow-border)/50 px-2 py-1.5 font-mono text-[11px] text-(--flow-muted-foreground)">
          shuffled · seed {transform.seed}
        </div>
      )}

      {/* The sheet: every input laid out as data, with its port handle. */}
      <div className="border-t border-(--flow-border)/50">
        {transform.ports.map((port) => {
          const Icon = variableTypeIcon(port.type);
          const handleId = handleFor({ kind: "field", id: port.id });
          const warned = warnings.some((warning) => warning.portId === port.id);
          return (
            <div key={port.id} className="relative border-b border-(--flow-border)/30 px-2 py-1">
              <HandleComponent
                id={handleId}
                type="target"
                position={Position.Left}
                className={HANDLE_CLASS}
                data-targetable={targetable}
                data-connected={connectedHandleIds.has(handleId)}
                isConnectableStart={false}
              />
              <div className="flex items-baseline gap-1.5">
                <Icon
                  className={cn(
                    "size-3 shrink-0 translate-y-0.5",
                    warned ? "text-destructive" : "text-(--flow-muted-foreground)",
                  )}
                />
                <span className="font-mono text-[11px] text-(--color-palette-blue-text)">
                  {port.name}
                </span>
                <span className="ml-auto text-[10px] text-(--flow-muted-foreground)">
                  {port.wiredFrom ?? "not connected"}
                </span>
              </div>
              <ValueGrid value={port.value} />
            </div>
          );
        })}
      </div>

      {/* The bottom row of the sheet. */}
      <div
        className={cn(
          "flex items-start gap-2 px-2 py-1.5",
          blocking.length > 0 && "bg-destructive/10",
        )}
      >
        <OutputIcon
          className={cn(
            "mt-0.5 size-3.5 shrink-0",
            blocking.length > 0 ? "text-destructive" : "text-(--flow-muted-foreground)",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                "min-w-0 truncate font-mono text-xs",
                blocking.length > 0 ? "text-destructive" : "text-foreground",
              )}
            >
              = {blocking.length > 0 ? "—" : previewText(analysis.output)}
            </span>
            <span className="shrink-0 text-[10px] text-(--flow-muted-foreground)">
              {transform.derivedTypeLabel ? "from input" : typeLabel(transform.outputType)}
            </span>
          </div>
          {/* Errors at rest: the message sits in the sheet, where the wrong
              answer would be. */}
          {diagnostics.slice(0, 2).map((diagnostic, index) => (
            <div
              key={`${diagnostic.category}-${index}`}
              className={cn(
                "mt-0.5 text-[10px] leading-snug",
                diagnostic.severity === "blocking"
                  ? "text-destructive"
                  : "text-(--flow-muted-foreground)",
              )}
            >
              {diagnostic.message}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** A value as a spreadsheet would show it: rows of cells, truncated hard. */
function ValueGrid({ value }: { value: FormulaValue }) {
  if (value.kind === "absent") {
    return <div className="pl-4 text-[10px] italic text-destructive">nothing</div>;
  }
  if (value.kind === "array" && value.items[0]?.kind === "record") {
    const fields = Object.keys(value.items[0].fields);
    return (
      <table className="mt-0.5 w-full table-fixed border-collapse font-mono text-[10px]">
        <thead>
          <tr className="text-(--flow-muted-foreground)">
            {fields.map((field) => (
              <th key={field} className="truncate px-1 text-left font-normal">
                {field}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {value.items.slice(0, 3).map((item, index) => (
            <tr key={index} className="odd:bg-(--flow-border)/20">
              {item.kind === "record"
                ? Object.values(item.fields).map((field, column) => (
                    <td key={column} className="truncate px-1">
                      {asText(field)}
                    </td>
                  ))
                : null}
            </tr>
          ))}
          {value.items.length > 3 ? (
            <tr>
              <td colSpan={fields.length} className="px-1 text-(--flow-muted-foreground)">
                +{value.items.length - 3} more
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    );
  }
  return (
    <div className="pl-4 font-mono text-[10px] text-(--flow-muted-foreground)">
      {previewText(value)}
    </div>
  );
}

export function VariantCInspector({ node, transform, shapes }: VariantInspectorProps) {
  const toasts = useToastManager();
  const analysis = useAnalysis(transform);
  const warnings = portWarnings(transform);

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
        </Section>
      )}

      {transform.kind === "shuffle" ? (
        <Section label="Order">
          <SectionRow className="grid-cols-[1fr_auto] items-center">
            <span className="font-mono text-xs">seed {transform.seed}</span>
            <Button size="sm" variant="outline" onClick={() => prototypeActions.reshuffle(node.id)}>
              <ShuffleIcon />
              Reshuffle
            </Button>
          </SectionRow>
        </Section>
      ) : (
        <Section label={transform.kind === "filter" ? "Keep when" : "Formula"}>
          <SectionHelperText>
            The Formula is written on the node itself, in its <span className="font-mono">fx</span>{" "}
            bar, beside the values it reads.
          </SectionHelperText>
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
        <SectionHelperText>Now: {previewText(analysis.output)}</SectionHelperText>
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

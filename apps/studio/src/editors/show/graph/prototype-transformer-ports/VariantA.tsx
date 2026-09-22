// PROTOTYPE (issue #676) — Variant A: "Inspector-owned ports".
//
// Thesis: a Transformer port is a Scene Variable in everything but name, so
// reuse the machinery that already does this. The node body is a read-only
// summary — ports, Formula, output — and every edit happens in the inspector,
// in the same `VariableInspector` the Scene node uses, down to "Add Input".
//
// A rename cascades silently and reports itself afterwards in a toast with an
// undo, on the bet that a director renaming their own port already knows what
// it will do.
import {
  Button,
  Section,
  SectionHelperText,
  SectionRow,
  ShuffleIcon,
  Textarea,
  TypeSelect,
  cn,
  useToastManager,
  variableTypeIcon,
} from "@mechane/design-system";
import { typeLabel, type Type } from "@mechane/domain";
import { Position } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";

import {
  VariableInspector,
  type VariableInspectorEditing,
} from "../../../../components/VariableInspector";
import { handleFor } from "../handle-ids";
import { HANDLE_CLASS } from "../handle-styles";
import { prototypeActions } from "./transform-prototype-state";
import {
  portDiagnostics,
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
  const OutputIcon = variableTypeIcon(transform.outputType);
  const diagnostics = portDiagnostics(transform);

  return (
    <>
      <div className="grid grid-cols-[2.5rem_1fr] gap-x-2">
        {transform.ports.map((port) => {
          const Icon = variableTypeIcon(port.type);
          const handleId = handleFor({ kind: "field", id: port.id });
          const warned = diagnostics.some((diagnostic) => diagnostic.portId === port.id);
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
                  {port.wiredFrom ?? "not connected"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-(--flow-border)/50 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide text-(--flow-muted-foreground)">
          {formulaLabel(transform.kind)}
        </div>
        <div className="truncate font-mono text-xs">
          {transform.kind === "shuffle"
            ? `shuffled · seed ${transform.seed}`
            : transform.formula || "—"}
        </div>
      </div>
      <div className="border-t border-(--flow-border)/50 grid grid-cols-[2.5rem_1fr] gap-x-2 items-center py-1.5">
        <OutputIcon className="size-4 shrink-0 justify-self-center ml-2 text-(--flow-muted-foreground)" />
        <div className="flex min-w-0 items-baseline justify-between gap-2 pr-3">
          <span className="truncate text-xs">{transform.preview}</span>
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
  const [formula, setFormula] = useState(transform.formula);
  useEffect(() => setFormula(transform.formula), [transform.formula]);

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
          <SectionHelperText>
            {transform.kind === "filter" ? "A Filter" : "A Shuffle"} has exactly one input. It can't
            be renamed, reordered or removed.
          </SectionHelperText>
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
          <SectionHelperText>
            One seed per Run, or per Device Instance inside a Flow. Reshuffling replaces it for the
            Run that's live now.
          </SectionHelperText>
        </Section>
      ) : (
        <Section label={transform.kind === "filter" ? "Keep when" : "Formula"}>
          <SectionRow className="grid-cols-[1fr]">
            <Textarea
              className="col-span-full font-mono text-xs"
              rows={3}
              value={formula}
              aria-label="Formula"
              onChange={(event) => setFormula(event.target.value)}
              onBlur={() => prototypeActions.setFormula(node.id, formula)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </SectionRow>
          <SectionHelperText>
            {transform.kind === "filter"
              ? "Runs once per item, with the item as `item`. Must answer true or false."
              : "Reads the Inputs above by name."}
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
        <SectionHelperText>Now: {transform.preview}</SectionHelperText>
      </Section>

      {portDiagnostics(transform).length > 0 ? (
        <Section label="Needs attention">
          {portDiagnostics(transform).map((diagnostic) => (
            <SectionRow key={diagnostic.portId} className="grid-cols-[1fr]">
              <span className="text-xs text-destructive">{diagnostic.message}</span>
            </SectionRow>
          ))}
        </Section>
      ) : null}
    </>
  );
}

function formulaLabel(kind: "calculate" | "filter" | "shuffle"): string {
  if (kind === "filter") return "keep when";
  if (kind === "shuffle") return "order";
  return "formula";
}

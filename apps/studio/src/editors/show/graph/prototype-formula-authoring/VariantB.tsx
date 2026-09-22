// PROTOTYPE (issue #675) — Variant B: "The workbench".
//
// Thesis: writing a Formula is not a field edit, it is a task, so it gets a
// room of its own. The node and the inspector show the answer, never the
// source; opening the Formula opens a full-width workbench with the inputs'
// live values on the left (a real table of the real records), the editor in the
// middle at a width where diagnostics and completions fit, and the catalogue on
// the right so the vocabulary is discoverable without documentation.
//
// The bet: a non-developer needs to see the data to write about the data. The
// risk is modality — the canvas is hidden while you are in here, so the wiring
// context the Formula depends on is out of sight.
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
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import {
  VariableInspector,
  type VariableInspectorEditing,
} from "../../../../components/VariableInspector";
import { handleFor } from "../handle-ids";
import { HANDLE_CLASS } from "../handle-styles";
import { FormulaEditor } from "./FormulaEditor";
import { useScope } from "./VariantA";
import { CATALOGUE, asText, previewText, typeName, type FormulaValue } from "./formula-language";
import {
  analyseTransform,
  prototypeActions,
  prototypeTransform,
  subscribePrototype,
} from "./formula-state";
import {
  portWarnings,
  shortValue,
  useAnalysis,
  usePortHandles,
  type VariantInspectorProps,
  type VariantNodeProps,
} from "./variant-parts";

// --- which node's workbench is open -----------------------------------------

let openNodeId: string | null = null;
const listeners = new Set<() => void>();

function setOpenNode(nodeId: string | null): void {
  openNodeId = nodeId;
  for (const listener of listeners) listener();
}

function subscribeOpen(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useOpenNode(): string | null {
  return useSyncExternalStore(
    subscribeOpen,
    () => openNodeId,
    () => null,
  );
}

// --- node -------------------------------------------------------------------

export function VariantBNodeBody({
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
                  {port.wiredFrom ? shortValue(port.value, 20) : "not connected"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* No Formula on the node at all: the node reports the answer. */}
      <div className="border-t border-(--flow-border)/50 px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wide text-(--flow-muted-foreground)">
            {transform.kind === "shuffle" ? `order · seed ${transform.seed}` : "produces"}
          </span>
          <span className="shrink-0 text-[10px] text-(--flow-muted-foreground)">
            {transform.derivedTypeLabel ? "from input" : typeLabel(transform.outputType)}
          </span>
        </div>
        <div className="mt-0.5 flex items-start gap-2">
          <OutputIcon
            className={cn(
              "mt-0.5 size-4 shrink-0",
              blocking.length > 0 ? "text-destructive" : "text-(--flow-muted-foreground)",
            )}
          />
          <span
            className={cn(
              "min-w-0 text-sm leading-snug",
              blocking.length > 0 ? "text-destructive" : "text-foreground",
            )}
          >
            {blocking.length > 0
              ? "Nothing — the Formula has a problem"
              : shortValue(analysis.output, 64)}
          </span>
        </div>
      </div>

      {blocking.length > 0 ? (
        <button
          type="button"
          className="nodrag border-t border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-[11px] leading-snug text-destructive hover:bg-destructive/20"
          onClick={() => setOpenNode(nodeId)}
        >
          {blocking[0]!.message}
          <span className="mt-1 block font-medium underline">Fix the Formula</span>
        </button>
      ) : transform.kind !== "shuffle" ? (
        <button
          type="button"
          className="nodrag border-t border-(--flow-border)/50 px-3 py-1.5 text-left text-[11px] text-(--flow-muted-foreground) hover:bg-(--flow-border)/30"
          onClick={() => setOpenNode(nodeId)}
        >
          <span className="font-mono">fx</span> Edit Formula
        </button>
      ) : null}
    </>
  );
}

// --- inspector --------------------------------------------------------------

export function VariantBInspector({ node, transform, shapes }: VariantInspectorProps) {
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
        </Section>
      ) : (
        <Section label={transform.kind === "filter" ? "Keep when" : "Formula"}>
          <SectionRow className="grid-cols-[1fr]">
            <button
              type="button"
              className={cn(
                "w-full truncate rounded-sm border border-input bg-muted/40 px-2 py-1.5 text-left font-mono text-xs hover:bg-muted",
                analysis.blocked && "border-destructive/50 text-destructive",
              )}
              onClick={() => setOpenNode(node.id)}
            >
              {transform.formula || "Write a Formula…"}
            </button>
          </SectionRow>
          <SectionRow className="grid-cols-[1fr_auto] items-center">
            <span
              className={cn(
                "min-w-0 truncate text-xs",
                analysis.blocked ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {analysis.blocked
                ? `${analysis.formula?.diagnostics.filter((d) => d.severity === "blocking").length} problem(s)`
                : `= ${previewText(analysis.output)}`}
            </span>
            <Button size="sm" variant="outline" onClick={() => setOpenNode(node.id)}>
              Open editor
            </Button>
          </SectionRow>
          <SectionHelperText>
            The Formula opens in its own workbench, with the inputs' values beside it.
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

// --- the workbench ----------------------------------------------------------

export function VariantBWorkbench() {
  const nodeId = useOpenNode();
  const snapshot = useSyncExternalStore(
    subscribePrototype,
    () => (nodeId ? prototypeTransform(nodeId) : null),
    () => null,
  );

  useEffect(() => {
    if (!nodeId) return undefined;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenNode(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [nodeId]);

  if (!nodeId || !snapshot) return null;
  return <Workbench nodeId={nodeId} />;
}

function Workbench({ nodeId }: { nodeId: string }) {
  const transform = useSyncExternalStore(subscribePrototype, () => prototypeTransform(nodeId));
  const scope = useScope(transform);
  const analysis = useMemo(() => analyseTransform(transform), [transform]);
  const diagnostics = analysis.formula?.diagnostics ?? [];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpenNode(null);
      }}
    >
      <div className="flex h-[min(34rem,85vh)] w-[min(66rem,92vw)] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div>
            <div className="text-sm font-medium">
              {transform.kind === "filter" ? "Keep when" : "Formula"}
            </div>
            <div className="text-xs text-muted-foreground">
              Reads {transform.ports.map((port) => port.name).join(", ") || "nothing yet"}
            </div>
          </div>
          <Button size="sm" onClick={() => setOpenNode(null)}>
            Done
          </Button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[17rem_1fr_15rem]">
          {/* Inputs, with the values actually flowing through them. */}
          <aside className="min-h-0 overflow-auto border-r border-border p-3">
            <h3 className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              Inputs right now
            </h3>
            {transform.kind === "filter" ? (
              <ValueBlock
                name="item"
                value={scope.itemBinding?.value ?? { kind: "absent", because: "" }}
                note="one at a time"
              />
            ) : null}
            {transform.ports.map((port) => (
              <ValueBlock key={port.id} name={port.name} value={port.value} />
            ))}
          </aside>

          {/* The editor, at a width where a completion popup and a diagnostic fit. */}
          <section className="flex min-h-0 flex-col p-3">
            <FormulaEditor
              className="min-h-[7rem] flex-none bg-muted/30 text-sm"
              value={transform.formula}
              scope={scope}
              autoFocus
              onChange={(next) => prototypeActions.setFormula(nodeId, next)}
            />

            <div className="mt-3 rounded-md border border-border p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Result
              </div>
              <div
                className={cn(
                  "mt-1 font-mono text-sm",
                  analysis.blocked ? "text-destructive" : "text-foreground",
                )}
              >
                {analysis.blocked ? "Can't be evaluated yet" : previewText(analysis.output)}
              </div>
              {analysis.formula && !analysis.blocked ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  {typeName(analysis.formula.type)}
                  {transform.kind === "filter" && analysis.output.kind === "array"
                    ? ` · keeps ${analysis.output.items.length} of ${
                        transform.ports[0]?.value.kind === "array"
                          ? transform.ports[0].value.items.length
                          : 0
                      }`
                    : ""}
                </div>
              ) : null}
            </div>

            <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-auto">
              {diagnostics.map((diagnostic, index) => (
                <li
                  key={`${diagnostic.category}-${index}`}
                  className={cn(
                    "rounded-sm border-l-2 px-2 py-1 text-xs leading-snug",
                    diagnostic.severity === "blocking"
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-(--color-palette-orange-text) bg-muted/50 text-muted-foreground",
                  )}
                >
                  {diagnostic.message}
                  <span className="ml-1 opacity-60">
                    {diagnostic.severity === "blocking" ? "· blocks publishing" : "· right now"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* The catalogue, because the vocabulary is the other half of the job. */}
          <aside className="min-h-0 overflow-auto border-l border-border p-3">
            <h3 className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              Functions
            </h3>
            <ul className="space-y-2">
              {CATALOGUE.map((entry) => (
                <li key={entry.name}>
                  <div className="font-mono text-xs text-(--color-palette-purple-text)">
                    {entry.signature}
                  </div>
                  <div className="text-[11px] leading-snug text-muted-foreground">
                    {entry.summary}
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ValueBlock({ name, value, note }: { name: string; value: FormulaValue; note?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs text-(--color-palette-blue-text)">{name}</span>
        <span className="text-[10px] text-muted-foreground">
          {note ?? (value.kind === "array" ? `${value.items.length} items` : value.kind)}
        </span>
      </div>
      {value.kind === "array" && value.items[0]?.kind === "record" ? (
        <table className="mt-1 w-full table-fixed border-collapse text-[11px]">
          <thead>
            <tr className="text-muted-foreground">
              {Object.keys(value.items[0].fields).map((field) => (
                <th
                  key={field}
                  className="truncate border-b border-border px-1 py-0.5 text-left font-normal"
                >
                  {field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.items.slice(0, 6).map((item, index) => (
              <tr key={index}>
                {item.kind === "record"
                  ? Object.values(item.fields).map((field, column) => (
                      <td key={column} className="truncate px-1 py-0.5">
                        {asText(field)}
                      </td>
                    ))
                  : null}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div
          className={cn(
            "mt-1 rounded-sm bg-muted/50 px-2 py-1 font-mono text-[11px]",
            value.kind === "absent" && "text-destructive",
          )}
        >
          {value.kind === "record"
            ? Object.entries(value.fields)
                .map(([field, inner]) => `${field}: ${asText(inner)}`)
                .join("\n")
            : previewText(value)}
        </div>
      )}
    </div>
  );
}

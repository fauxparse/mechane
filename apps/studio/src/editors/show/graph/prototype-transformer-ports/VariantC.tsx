// PROTOTYPE (issue #676) — Variant C: "Ports on the node".
//
// Thesis: wiring happens on the canvas, so authoring the things you wire into
// should too. The node body is a small editable table — click a name to rename
// it, a row of chevrons to reorder, an "Add input" row at the bottom — with a
// spreadsheet-style Formula bar underneath and the current value as the last
// row. The inspector holds nothing but a summary.
//
// Because there's no inspector context to explain a cascade, a rename asks
// first, in the same non-dismissible dialog shape as the Source type change
// (docs/issues/graph-inspector-source-type.md).
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  ChevronDownIcon,
  ChevronUpIcon,
  LockIcon,
  PlusIcon,
  Section,
  SectionHelperText,
  SectionRow,
  ShuffleIcon,
  Trash2Icon,
  cn,
} from "@mechane/design-system";
import { typeLabel } from "@mechane/domain";
import { Position } from "@xyflow/react";
import { useEffect, useState } from "react";

import { handleFor } from "../handle-ids";
import { HANDLE_CLASS } from "../handle-styles";
import { countReferences, prototypeActions } from "./transform-prototype-state";
import {
  portDiagnostics,
  usePortHandles,
  type VariantInspectorProps,
  type VariantNodeProps,
} from "./variant-parts";

interface PendingRename {
  portId: string;
  from: string;
  to: string;
  references: number;
}

export function VariantCNodeBody({
  nodeId,
  transform,
  handle: HandleComponent,
  connectedHandleIds,
  targetable,
}: VariantNodeProps) {
  usePortHandles(nodeId, transform);
  const [editingPort, setEditingPort] = useState<string | null>(null);
  const [editingFormula, setEditingFormula] = useState(false);
  const [formula, setFormula] = useState(transform.formula);
  const [pending, setPending] = useState<PendingRename | null>(null);
  useEffect(() => setFormula(transform.formula), [transform.formula]);
  const locked = transform.kind !== "calculate";

  const requestRename = (portId: string, from: string, to: string) => {
    setEditingPort(null);
    if (to.trim() === "" || to === from) return;
    const references = countReferences(transform.formula, from);
    if (references === 0) {
      prototypeActions.renamePort(nodeId, portId, to);
      return;
    }
    setPending({ portId, from, to, references });
  };

  return (
    <>
      <div className="border-t border-(--flow-border)/50">
        <div className="grid grid-cols-[1fr_auto] gap-2 px-3 py-1 text-[10px] uppercase tracking-wide text-(--flow-muted-foreground)">
          <span>{locked ? "input" : "inputs"}</span>
          <span>coming in</span>
        </div>
        {transform.ports.map((port, index) => {
          const handleId = handleFor({ kind: "field", id: port.id });
          return (
            <div
              key={port.id}
              className="group/row relative grid grid-cols-[1fr_auto] items-center gap-2 border-t border-(--flow-border)/30 px-3 py-1"
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
              {editingPort === port.id ? (
                <input
                  autoFocus
                  defaultValue={port.name}
                  aria-label={`Rename ${port.name}`}
                  className="w-full rounded-sm bg-background/80 px-1 font-mono text-xs outline-1 outline-(--flow-border)"
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setEditingPort(null);
                  }}
                  onBlur={(event) => requestRename(port.id, port.name, event.target.value)}
                />
              ) : (
                <button
                  type="button"
                  disabled={locked}
                  className={cn(
                    "flex items-center gap-1 justify-self-start font-mono text-xs",
                    locked ? "cursor-default" : "hover:underline",
                  )}
                  onClick={() => setEditingPort(port.id)}
                >
                  {locked ? <LockIcon className="size-3 opacity-50" /> : null}
                  {port.name}
                </button>
              )}
              <div className="flex items-center gap-1">
                <span className="truncate text-[11px] text-(--flow-muted-foreground)">
                  {port.wiredFrom ?? "nothing"}
                </span>
                {locked ? null : (
                  <div className="hidden items-center group-hover/row:flex">
                    <button
                      type="button"
                      aria-label={`Move ${port.name} up`}
                      disabled={index === 0}
                      className="opacity-50 hover:opacity-100 disabled:opacity-20"
                      onClick={() => prototypeActions.movePort(nodeId, port.id, -1)}
                    >
                      <ChevronUpIcon className="size-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${port.name} down`}
                      disabled={index === transform.ports.length - 1}
                      className="opacity-50 hover:opacity-100 disabled:opacity-20"
                      onClick={() => prototypeActions.movePort(nodeId, port.id, 1)}
                    >
                      <ChevronDownIcon className="size-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${port.name}`}
                      className="opacity-50 hover:opacity-100"
                      onClick={() => prototypeActions.removePort(nodeId, port.id)}
                    >
                      <Trash2Icon className="size-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {locked ? null : (
          <button
            type="button"
            className="flex w-full items-center gap-1 border-t border-(--flow-border)/30 px-3 py-1 text-left text-xs text-(--flow-muted-foreground) hover:text-(--flow-foreground)"
            onClick={() => {
              const portId = prototypeActions.addPort(nodeId);
              setEditingPort(portId);
            }}
          >
            <PlusIcon className="size-3" />
            Add input
          </button>
        )}
      </div>

      {transform.kind === "shuffle" ? (
        <div className="flex items-center gap-2 border-t border-(--flow-border)/50 px-3 py-1.5 text-xs">
          <span className="font-serif italic text-(--flow-muted-foreground)">fx</span>
          <span className="font-mono">shuffle(seed {transform.seed})</span>
          <button
            type="button"
            aria-label="Reshuffle"
            className="ml-auto opacity-50 hover:opacity-100"
            onClick={() => prototypeActions.reshuffle(nodeId)}
          >
            <ShuffleIcon className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-2 border-t border-(--flow-border)/50 px-3 py-1.5">
          <span className="font-serif text-sm italic text-(--flow-muted-foreground)">fx</span>
          {editingFormula ? (
            <textarea
              autoFocus
              rows={3}
              value={formula}
              aria-label="Formula"
              className="w-full resize-none rounded-sm bg-background/80 px-1 font-mono text-xs outline-1 outline-(--flow-border)"
              onChange={(event) => setFormula(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              onBlur={() => {
                prototypeActions.setFormula(nodeId, formula);
                setEditingFormula(false);
              }}
            />
          ) : (
            <button
              type="button"
              className="min-w-0 flex-1 text-left font-mono text-xs break-words hover:underline"
              onClick={() => setEditingFormula(true)}
            >
              {transform.formula || (transform.kind === "filter" ? "keep when…" : "formula…")}
            </button>
          )}
        </div>
      )}

      <div className="relative flex items-baseline gap-2 border-t border-(--flow-border)/50 bg-(--flow-border)/15 px-3 py-1.5">
        <span className="font-mono text-xs text-(--flow-muted-foreground)">=</span>
        <span className="min-w-0 flex-1 truncate text-xs">{transform.preview}</span>
        <span className="shrink-0 text-[10px] text-(--flow-muted-foreground)">
          {transform.derivedTypeLabel ? "from input" : typeLabel(transform.outputType)}
        </span>
        <HandleComponent
          id={handleFor({ kind: "output" })}
          type="source"
          position={Position.Right}
          className={HANDLE_CLASS}
          data-connected={connectedHandleIds.has(handleFor({ kind: "output" }))}
          isConnectableEnd={false}
        />
      </div>

      {pending ? (
        <AlertDialog open onOpenChange={(open) => !open && setPending(null)}>
          <AlertDialogContent>
            <AlertDialogTitle>
              Rename “{pending.from}” to “{pending.to}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending.references === 1
                ? "One place in this Formula reads it, and will be rewritten to match."
                : `${pending.references} places in this Formula read it, and will be rewritten to match.`}
            </AlertDialogDescription>
            <AlertDialogFooter>
              <Button variant="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  prototypeActions.renamePort(nodeId, pending.portId, pending.to);
                  setPending(null);
                }}
              >
                Rename
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}

export function VariantCInspector({ transform }: VariantInspectorProps) {
  const diagnostics = portDiagnostics(transform);
  return (
    <>
      <Section label="Transformer">
        <SectionRow className="grid-cols-[1fr]">
          <span className="text-xs text-muted-foreground">
            {transform.kind === "calculate"
              ? "Calculate — inputs, Formula and output are edited on the node itself."
              : `${transform.kind === "filter" ? "Filter" : "Shuffle"} — one input, edited on the node itself.`}
          </span>
        </SectionRow>
        <SectionHelperText>
          Output: {transform.derivedTypeLabel ?? typeLabel(transform.outputType)} · now{" "}
          {transform.preview}
        </SectionHelperText>
      </Section>
      {diagnostics.length > 0 ? (
        <Section label="Needs attention">
          {diagnostics.map((diagnostic) => (
            <SectionRow key={diagnostic.portId} className="grid-cols-[1fr]">
              <span className="text-xs text-destructive">{diagnostic.message}</span>
            </SectionRow>
          ))}
        </Section>
      ) : null}
    </>
  );
}

// PROTOTYPE (issue #676) — Variant B: "Formula-first".
//
// Thesis: the Formula is the document and the ports are its projection. There
// is no Add Input button: an identifier the Formula mentions *is* an input, and
// the node grows a port for it the moment it's typed. A rename is therefore an
// ordinary text edit, which makes the cascade question disappear — the Formula
// and the port list cannot disagree, because one is derived from the other.
//
// The node body is dominated by the Formula, on the bet that what a director
// needs at a glance is the rule, not the plumbing.
import {
  Button,
  Input,
  PencilIcon,
  Section,
  SectionHelperText,
  SectionRow,
  ShuffleIcon,
  Switch,
  Textarea,
  TypeSelect,
  cn,
} from "@mechane/design-system";
import { typeLabel, type Type } from "@mechane/domain";
import { Position } from "@xyflow/react";
import { useEffect, useState } from "react";

import { handleFor } from "../handle-ids";
import { HANDLE_CLASS } from "../handle-styles";
import {
  countReferences,
  formulaIdentifiers,
  prototypeActions,
  type PrototypeTransform,
} from "./transform-prototype-state";
import { usePortHandles, type VariantInspectorProps, type VariantNodeProps } from "./variant-parts";

export function VariantBNodeBody({
  nodeId,
  transform,
  handle: HandleComponent,
  connectedHandleIds,
  targetable,
}: VariantNodeProps) {
  usePortHandles(nodeId, transform);
  const referenced = formulaIdentifiers(transform.formula);

  return (
    <>
      {transform.kind === "shuffle" ? (
        <div className="border-t border-(--flow-border)/50 px-3 py-2 text-xs">
          <span className="text-(--flow-muted-foreground)">every Device gets its own order · </span>
          <span className="font-mono">seed {transform.seed}</span>
        </div>
      ) : (
        <div className="border-t border-(--flow-border)/50 px-3 py-2">
          <div className="flex gap-2">
            <span className="shrink-0 font-serif text-sm italic text-(--flow-muted-foreground)">
              fx
            </span>
            <FormulaText formula={transform.formula} ports={transform.ports} />
          </div>
        </div>
      )}

      <div className="border-t border-(--flow-border)/50 py-1">
        {transform.ports.map((port) => {
          const handleId = handleFor({ kind: "field", id: port.id });
          const unused = transform.kind === "calculate" && !referenced.includes(port.name);
          return (
            <div key={port.id} className="relative flex items-center gap-2 px-3 py-1">
              <HandleComponent
                id={handleId}
                type="target"
                position={Position.Left}
                className={HANDLE_CLASS}
                data-targetable={targetable}
                data-connected={connectedHandleIds.has(handleId)}
                isConnectableStart={false}
              />
              <span
                className={cn(
                  "rounded-sm bg-(--flow-border)/40 px-1.5 py-0.5 font-mono text-[11px]",
                  unused && "line-through opacity-50",
                )}
              >
                {port.name}
              </span>
              <span className="ml-auto truncate text-[10px] text-(--flow-muted-foreground)">
                {port.wiredFrom ?? (unused ? "unused" : "connect something")}
              </span>
            </div>
          );
        })}
      </div>

      <div className="relative border-t border-(--flow-border)/50 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide text-(--flow-muted-foreground)">
          {transform.derivedTypeLabel ?? typeLabel(transform.outputType)}
        </div>
        <div className="truncate text-xs">{transform.preview}</div>
        <HandleComponent
          id={handleFor({ kind: "output" })}
          type="source"
          position={Position.Right}
          className={HANDLE_CLASS}
          data-connected={connectedHandleIds.has(handleFor({ kind: "output" }))}
          isConnectableEnd={false}
        />
      </div>
    </>
  );
}

/** The Formula with its port references picked out, so the inputs read as part of it. */
function FormulaText({ formula, ports }: { formula: string; ports: PrototypeTransform["ports"] }) {
  const names = ports.map((port) => port.name);
  const parts = formula.split(/([A-Za-z_][A-Za-z0-9_]*)/g);
  return (
    <code className="font-mono text-xs leading-relaxed break-words">
      {parts.map((part, index) =>
        names.includes(part) ? (
          <span
            // Prototype: the split index is the only identity a token has.
            key={`${part}-${index}`}
            className="rounded-sm bg-(--flow-border)/50"
          >
            {part}
          </span>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </code>
  );
}

export function VariantBInspector({ node, transform, shapes }: VariantInspectorProps) {
  const [formula, setFormula] = useState(transform.formula);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [requireType, setRequireType] = useState(false);
  useEffect(() => setFormula(transform.formula), [transform.formula]);
  const referenced = formulaIdentifiers(transform.formula);

  return (
    <>
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
            A Shuffle has no Formula. Its order is a function of the seed and what came in.
          </SectionHelperText>
        </Section>
      ) : (
        <Section label={transform.kind === "filter" ? "Keep when" : "Formula"}>
          <SectionRow className="grid-cols-[1fr]">
            <Textarea
              className="col-span-full font-mono text-xs"
              rows={5}
              value={formula}
              aria-label="Formula"
              onChange={(event) => setFormula(event.target.value)}
              onBlur={() => prototypeActions.setFormula(node.id, formula)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </SectionRow>
          <SectionHelperText>
            {transform.kind === "filter"
              ? "Runs once per item, with the item as `item`."
              : "Every name you use here becomes an input on the node."}
          </SectionHelperText>
        </Section>
      )}

      <Section label={transform.kind === "calculate" ? "Inputs the Formula uses" : "Input"}>
        {transform.ports.map((port) => {
          const uses = countReferences(transform.formula, port.name);
          return (
            <SectionRow key={port.id} className="grid-cols-[1fr_auto] items-center">
              {renaming === port.id ? (
                <Input
                  autoFocus
                  defaultValue={port.name}
                  aria-label={`Rename ${port.name}`}
                  className="col-span-2 font-mono text-xs"
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setRenaming(null);
                  }}
                  onBlur={(event) => {
                    prototypeActions.renamePort(node.id, port.id, event.target.value);
                    setRenaming(null);
                  }}
                />
              ) : (
                <>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-mono text-xs">{port.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {port.wiredFrom ? `wired from ${port.wiredFrom}` : "nothing wired in"}
                      {transform.kind === "calculate"
                        ? ` · used ${uses} ${uses === 1 ? "time" : "times"}`
                        : ""}
                    </span>
                  </div>
                  {transform.kind === "calculate" ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Rename ${port.name} everywhere`}
                      onClick={() => setRenaming(port.id)}
                    >
                      <PencilIcon />
                    </Button>
                  ) : null}
                </>
              )}
            </SectionRow>
          );
        })}
        <SectionHelperText>
          {transform.kind === "calculate"
            ? referenced.length === transform.ports.length
              ? "Renaming here rewrites the Formula with it."
              : "Struck-through inputs are still wired but no longer read. Delete the wire to drop them."
            : "One input, managed for you."}
        </SectionHelperText>
      </Section>

      <Section label="Output">
        <SectionRow className="grid-cols-[1fr]">
          <span className="text-xs text-muted-foreground">
            {transform.derivedTypeLabel ?? `${typeLabel(transform.outputType)} — from the Formula`}
          </span>
        </SectionRow>
        {transform.kind === "calculate" ? (
          <>
            <SectionRow className="grid-cols-[auto_1fr] items-center">
              <Switch
                checked={requireType}
                onCheckedChange={(checked) =>
                  typeof checked === "boolean" ? setRequireType(checked) : undefined
                }
                aria-label="Require a Type"
              />
              <span className="text-xs">Require a Type</span>
            </SectionRow>
            {requireType ? (
              <SectionRow className="grid-cols-[1fr]">
                <TypeSelect
                  value={transform.outputType}
                  shapes={shapes}
                  includeArray
                  aria-label="Required output Type"
                  onValueChange={(type: Type) => prototypeActions.setOutputType(node.id, type)}
                />
              </SectionRow>
            ) : null}
          </>
        ) : null}
        <SectionHelperText>Now: {transform.preview}</SectionHelperText>
      </Section>
    </>
  );
}

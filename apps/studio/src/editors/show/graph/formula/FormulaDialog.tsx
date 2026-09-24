// The immersive Formula surface (#686): the room a Formula gets when the
// inspector's 270px column is not enough.
//
// It is an enhancement, never the everyday path — #675 settled that the
// inspector section is where a Formula is written. What this adds is width
// (a measured 516px editor, where a Formula wraps twice instead of four
// times), the input ports as their real rows rather than one-line summaries,
// and the Function catalogue listed so the vocabulary is discoverable without
// documentation.
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  FormulaEditor,
  XIcon,
  cn,
} from "@mechane/design-system";
import {
  CATALOGUE,
  asText,
  previewText,
  typeName,
  type FormulaDiagnostic,
  type FormulaValue,
} from "@mechane/domain/formula";
import type { ShowGraph } from "@mechane/domain/graph";
import { typeLabel, type Shape } from "@mechane/domain/shapes";
import type { ReactNode } from "react";

import {
  useTransformerPreview,
  type StudioTransformerNode,
  type TransformerInputPreview,
} from "./use-transformer-preview";

export interface FormulaDialogProps {
  graph: ShowGraph;
  node: StudioTransformerNode | null;
  onFormulaChange(nodeId: string, formula: string): void;
  onOpenChange(open: boolean): void;
}

/** How many rows of an input array the left rail shows before it summarises. */
const VISIBLE_ROWS = 8;

export function FormulaDialog({ graph, node, onFormulaChange, onOpenChange }: FormulaDialogProps) {
  return (
    <Dialog open={node !== null} onOpenChange={onOpenChange}>
      {node ? (
        <DialogContent
          // 66rem wide with 17rem/15rem rails leaves the editor column at the
          // 516px #675 measured, where completion popups and diagnostics fit.
          className="h-[min(38rem,88vh)] w-[min(66rem,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden p-0"
        >
          <FormulaWorkbench
            graph={graph}
            node={node}
            onFormulaChange={onFormulaChange}
            onOpenChange={onOpenChange}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function FormulaWorkbench({
  graph,
  node,
  onFormulaChange,
  onOpenChange,
}: FormulaDialogProps & { node: StudioTransformerNode }) {
  const preview = useTransformerPreview(graph, node);
  const formula = "formula" in node.transform ? (node.transform.formula ?? "") : "";
  const filtering = node.transform.kind === "filter";
  const diagnostics = preview.analysis?.diagnostics ?? [];
  const shapes = graph.shapes ?? [];

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <DialogTitle>{filtering ? "Keep when" : "Formula"}</DialogTitle>
          <DialogDescription className="truncate text-xs">
            {node.name} reads{" "}
            {preview.inputs.length > 0
              ? preview.inputs.map((input) => input.name).join(", ")
              : "nothing yet"}
          </DialogDescription>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close the Formula editor"
          onClick={() => onOpenChange(false)}
        >
          <XIcon />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[17rem_1fr_15rem]">
        <aside className="min-h-0 overflow-auto border-r border-border p-3" aria-label="Inputs">
          <RailHeading>Inputs right now</RailHeading>
          {preview.item ? (
            <InputBlock input={preview.item} shapes={shapes} note="one at a time" />
          ) : null}
          {preview.inputs.map((input) => (
            <InputBlock key={input.name} input={input} shapes={shapes} />
          ))}
          {preview.inputs.length === 0 && !preview.item ? (
            <p className="text-xs text-muted-foreground">
              Add a named input, then connect a value to it.
            </p>
          ) : null}
        </aside>

        <section className="flex min-h-0 flex-col gap-3 overflow-auto p-3">
          <FormulaEditor
            className="min-h-[7rem] text-sm"
            value={formula}
            scope={preview.scope}
            autoFocus
            onChange={(next) => onFormulaChange(node.id, next)}
            placeholder={filtering ? "item.votes >= 10" : "Write a Formula…"}
          />

          <div className="rounded-md border border-border p-3">
            <RailHeading>Result</RailHeading>
            <output
              className={cn(
                "mt-1 block font-mono text-sm break-words",
                preview.analysis?.blocked ? "text-destructive" : "text-foreground",
              )}
            >
              {preview.analysis?.blocked
                ? "can't be evaluated yet"
                : previewText(preview.analysis?.value ?? null)}
            </output>
            <p className="mt-1 text-xs text-muted-foreground">
              {preview.analysis && !preview.analysis.blocked
                ? typeName(preview.analysis.type)
                : preview.outputType
                  ? typeLabel(preview.outputType, shapes)
                  : "No output Type yet"}
              {preview.kept ? ` · keeps ${preview.kept.kept} of ${preview.kept.total}` : ""}
            </p>
          </div>

          <ul className="space-y-1" aria-label="Diagnostics">
            {diagnostics.map((diagnostic, index) => (
              <DiagnosticRow
                key={`${diagnostic.category}-${diagnostic.from}-${index}`}
                diagnostic={diagnostic}
              />
            ))}
          </ul>
        </section>

        <aside className="min-h-0 overflow-auto border-l border-border p-3" aria-label="Functions">
          <RailHeading>Functions</RailHeading>
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
    </>
  );
}

function RailHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-[10px] tracking-wide text-muted-foreground uppercase">{children}</h3>
  );
}

function DiagnosticRow({ diagnostic }: { diagnostic: FormulaDiagnostic }) {
  const blocking = diagnostic.severity === "blocking";
  return (
    <li
      className={cn(
        "rounded-sm border-l-2 px-2 py-1 text-xs leading-snug",
        blocking
          ? "border-destructive bg-destructive/10 text-destructive"
          : "border-(--color-palette-orange-border) bg-muted/50 text-muted-foreground",
      )}
    >
      {diagnostic.message}
      <span className="ml-1 opacity-60">{blocking ? "· blocks publishing" : "· right now"}</span>
    </li>
  );
}

function InputBlock({
  input,
  shapes,
  note,
}: {
  input: TransformerInputPreview;
  shapes: readonly Shape[];
  note?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-mono text-xs text-(--color-palette-blue-text)">
          {input.name}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {input.type ? typeLabel(input.type, shapes) : "not connected"}
          {note ? ` · ${note}` : ""}
        </span>
      </div>
      <InputValue value={input.value} />
    </div>
  );
}

/**
 * The value itself, at the fidelity the room allows: an array of Shapes is a
 * table of its rows, which is the whole reason this surface exists.
 */
function InputValue({ value }: { value: FormulaValue }) {
  const firstRecord =
    value.kind === "array" ? value.items.find((item) => item.kind === "record") : null;
  if (value.kind === "array" && firstRecord?.kind === "record") {
    const columns = Object.keys(firstRecord.fields);
    return (
      <>
        <table className="mt-1 w-full table-fixed border-collapse text-[11px]">
          <thead>
            <tr className="text-muted-foreground">
              {columns.map((column) => (
                <th
                  key={column}
                  className="truncate border-b border-border px-1 py-0.5 text-left font-normal"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.items.slice(0, VISIBLE_ROWS).map((item, index) => (
              <tr key={index} className="border-b border-border/40 last:border-b-0">
                {columns.map((column) => (
                  <td key={column} className="truncate px-1 py-0.5">
                    {item.kind === "record" ? asText(item.fields[column] ?? item) : asText(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {value.items.length > VISIBLE_ROWS ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            and {value.items.length - VISIBLE_ROWS} more
          </p>
        ) : null}
      </>
    );
  }

  if (value.kind === "record") {
    return (
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 rounded-sm bg-muted/50 px-2 py-1 text-[11px]">
        {Object.entries(value.fields).map(([field, inner]) => (
          <div key={field} className="col-span-2 grid grid-cols-subgrid">
            <dt className="text-muted-foreground">{field}</dt>
            <dd className="truncate font-mono">{previewText(inner)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <p
      className={cn(
        "mt-1 rounded-sm bg-muted/50 px-2 py-1 font-mono text-[11px] break-words",
        value.kind === "absent" || value.kind === "failure" ? "text-muted-foreground" : "",
      )}
    >
      {previewText(value)}
    </p>
  );
}

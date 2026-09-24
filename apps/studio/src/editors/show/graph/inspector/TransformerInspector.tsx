import {
  Button,
  FormulaEditor,
  Input,
  Maximize2Icon,
  PlusIcon,
  Section,
  SectionHelperText,
  SectionRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Trash2Icon,
  TypeSelect,
  cn,
} from "@mechane/design-system";
import { previewText } from "@mechane/domain/formula";
import {
  transformerInputType,
  transformerOutputType,
  type DeviceNode,
  type GraphNode,
  type ShowGraph,
} from "@mechane/domain/graph";
import { typeLabel } from "@mechane/domain/shapes";
import type { GraphInspectorEditing } from "../../commands/use-graph-editing";
import { useTransformerPreview } from "../formula/use-transformer-preview";
import { useNodeInteraction } from "../node-interaction";

function PortNameInput({ name, onCommit }: { name: string; onCommit(name: string): void }) {
  // Uncontrolled, keyed by the committed name: the input owns the draft between
  // edits, and a rename from anywhere else remounts it with the new value.
  return (
    <Input
      key={name}
      aria-label={`Input name ${name}`}
      defaultValue={name}
      onBlur={(event) => {
        const next = event.target.value;
        if (next !== name) onCommit(next);
      }}
    />
  );
}

/**
 * The Device driven by the Flow that owns this Transformer, if any. A
 * per-connection Device gives every Player Instance its own Shuffle seed.
 */
function drivenDevice(graph: ShowGraph, parentId: string): DeviceNode | null {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    if (edge.kind !== "device" || edge.sourceId !== parentId) continue;
    const target = nodesById.get(edge.targetId);
    if (target?.kind === "device") return target;
  }
  return null;
}

export function TransformerInspector({
  node,
  editing,
  runActive = false,
  reshuffling = false,
  onReshuffle,
}: {
  node: Extract<GraphNode, { kind: "transformer" }>;
  editing: GraphInspectorEditing;
  runActive?: boolean;
  reshuffling?: boolean;
  onReshuffle?(transformerId: string, deviceId?: string): void;
}) {
  const formula = "formula" in node.transform ? (node.transform.formula ?? "") : "";
  const { scope, analysis } = useTransformerPreview(editing.graph, node);
  const { openFormulaEditor } = useNodeInteraction();
  const effectiveOutputType = transformerOutputType(editing.graph, node);
  const shuffleDevice = node.parentId === null ? null : drivenDevice(editing.graph, node.parentId);
  const perConnectionShuffle = shuffleDevice?.perConnection === true;

  return (
    <>
      <Section label="Operation">
        <SectionRow className="grid-cols-[1fr]">
          <Select
            value={node.transform.kind}
            onValueChange={(value) =>
              editing.setTransformerKind(node.id, value as "calculate" | "filter" | "shuffle")
            }
          >
            <SelectTrigger aria-label="Transformer operation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="calculate">Calculate</SelectItem>
              <SelectItem value="filter">Filter</SelectItem>
              <SelectItem value="shuffle">Shuffle</SelectItem>
            </SelectContent>
          </Select>
        </SectionRow>
        <SectionHelperText>
          {node.transform.kind === "calculate"
            ? "Calculate produces one value from named inputs."
            : node.transform.kind === "filter"
              ? "Filter evaluates item for each Array entry."
              : "Shuffle gives an Array a stable random order for the current Run."}
        </SectionHelperText>
      </Section>

      {node.transform.kind === "calculate" ? (
        <Section
          label="Inputs"
          buttons={
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Add Input"
              onClick={() => editing.addTransformerPort(node.id)}
            >
              <PlusIcon />
            </Button>
          }
        >
          {node.ports.map((port) => {
            const inputType = transformerInputType(editing.graph, node, port.id);
            return (
              <SectionRow key={port.id} className="grid-cols-[1fr_auto_auto_auto] items-center">
                <div>
                  <PortNameInput
                    name={port.name}
                    onCommit={(name) => editing.renameTransformerPort(node.id, port.id, name)}
                  />
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {inputType ? typeLabel(inputType, editing.graph.shapes ?? []) : "not connected"}
                  </span>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move ${port.name} up`}
                  disabled={node.ports[0]?.id === port.id}
                  onClick={() => {
                    const index = node.ports.findIndex((candidate) => candidate.id === port.id);
                    const ids = node.ports.map((candidate) => candidate.id);
                    if (index <= 0) return;
                    [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!];
                    editing.reorderTransformerPorts(node.id, ids);
                  }}
                >
                  ↑
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move ${port.name} down`}
                  disabled={node.ports.at(-1)?.id === port.id}
                  onClick={() => {
                    const index = node.ports.findIndex((candidate) => candidate.id === port.id);
                    const ids = node.ports.map((candidate) => candidate.id);
                    if (index < 0 || index >= ids.length - 1) return;
                    [ids[index], ids[index + 1]] = [ids[index + 1]!, ids[index]!];
                    editing.reorderTransformerPorts(node.id, ids);
                  }}
                >
                  ↓
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${port.name}`}
                  onClick={() => editing.removeTransformerPort(node.id, port.id)}
                >
                  <Trash2Icon />
                </Button>
              </SectionRow>
            );
          })}
          {node.ports.length === 0 ? (
            <SectionHelperText>Add a named input, then connect a value to it.</SectionHelperText>
          ) : null}
        </Section>
      ) : (
        <Section label="Input">
          <SectionRow className="grid-cols-[1fr]">
            <div className="rounded-sm border border-input px-2 py-1.5 font-mono text-xs">
              {node.ports[0]?.name ?? "input"}
            </div>
          </SectionRow>
          <SectionHelperText>
            Filter and Shuffle have exactly one Array input named input.
          </SectionHelperText>
        </Section>
      )}

      {node.transform.kind !== "shuffle" ? (
        <Section
          label={node.transform.kind === "filter" ? "Keep when" : "Formula"}
          buttons={
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Open the Formula editor"
              title="Open the Formula editor"
              onClick={() => openFormulaEditor(node.id)}
            >
              <Maximize2Icon />
            </Button>
          }
        >
          <SectionRow className="grid-cols-[1fr]">
            <FormulaEditor
              value={formula}
              scope={scope}
              onChange={(next) => editing.setTransformerFormula(node.id, next)}
              placeholder={
                node.transform.kind === "filter" ? "item.votes >= 10" : "Write a Formula…"
              }
            />
          </SectionRow>
          <SectionRow className="grid-cols-[auto_1fr] items-baseline gap-2">
            <span className="font-mono text-xs text-muted-foreground">=</span>
            <span
              className={cn(
                "truncate text-xs",
                analysis?.blocked ? "text-destructive" : "text-foreground",
              )}
            >
              {analysis?.blocked ? "can't be evaluated yet" : previewText(analysis?.value ?? null)}
            </span>
          </SectionRow>
          {analysis?.diagnostics.length ? (
            <SectionRow className="grid-cols-[1fr]">
              <ul className="space-y-1">
                {analysis.diagnostics.map((diagnostic, index) => (
                  <li
                    key={`${diagnostic.category}-${diagnostic.from}-${index}`}
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
          <SectionRow className="grid-cols-[1fr]">
            <div className="space-y-1 text-xs">
              <span className="font-medium">Reading now</span>
              <ul className="space-y-0.5 text-muted-foreground">
                {scope.itemBinding ? (
                  <li>
                    <span className="font-mono">{scope.itemBinding.name}</span>:{" "}
                    {previewText(scope.itemBinding.value)}
                  </li>
                ) : null}
                {scope.ports.map((port) => (
                  <li key={port.name}>
                    <span className="font-mono">{port.name}</span>: {previewText(port.value)}
                  </li>
                ))}
              </ul>
              {analysis?.blocked ? (
                <p className="text-destructive">Blocking — won&apos;t publish.</p>
              ) : null}
            </div>
          </SectionRow>
          <SectionHelperText>
            {node.transform.kind === "filter"
              ? "Use item.field to read the current item."
              : "Input names and IF, SUM, and COUNT complete with Ctrl+Space."}
          </SectionHelperText>
        </Section>
      ) : null}

      {node.transform.kind === "shuffle" ? (
        <Section label="Seed">
          <SectionRow className="grid-cols-[1fr_auto] items-center">
            <span className="text-xs text-muted-foreground">
              {node.parentId === null
                ? "Owned by the active Run"
                : perConnectionShuffle
                  ? "Owned by each Player Instance"
                  : "Owned by the connected Device"}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={!runActive || reshuffling || !onReshuffle || perConnectionShuffle}
              onClick={() => onReshuffle?.(node.id, shuffleDevice?.id)}
            >
              {reshuffling ? "Reshuffling…" : "Reshuffle"}
            </Button>
          </SectionRow>
          <SectionHelperText>
            {!runActive
              ? "Start a Run to create and replace the stable seed."
              : perConnectionShuffle
                ? "Reconnect a Player Instance to create a new local seed."
                : "Recomputation keeps this order until you reshuffle."}
          </SectionHelperText>
        </Section>
      ) : null}

      <Section label="Output">
        <SectionRow className="grid-cols-[1fr]">
          {node.transform.kind === "calculate" ? (
            <TypeSelect
              value={node.transform.outputType}
              shapes={editing.graph.shapes ?? []}
              includeArray
              aria-label="Output Type"
              onValueChange={(type) => editing.setTransformerOutputType(node.id, type)}
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              {effectiveOutputType ? "Same Array Type as input" : "Connect an Array input"}
            </span>
          )}
        </SectionRow>
      </Section>
    </>
  );
}

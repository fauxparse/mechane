// What a selected edge says about itself.
//
// Deliberately a read-out rather than an editor: an edge's only authored
// property today is where its runs were dragged, and that is authored on the
// canvas by dragging them. So this panel exists to answer "which edge is
// that, and what is it carrying" — the questions a graph with several edges
// between the same pair of nodes makes hard to answer by looking.
import {
  Input,
  Section,
  SectionRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SidebarContent,
} from "@mechane/design-system";
import type { EdgeKind, GraphEdge, ShowGraph, UpdateOperation, ValuePath } from "@mechane/domain";
import type { GraphInspectorEditing } from "../../commands/use-graph-editing";
const KIND_LABEL: Record<EdgeKind, string> = {
  wiring: "Wiring",
  navigate: "Navigate",
  update: "Update",
  device: "Device",
};
const UPDATE_OPERATION_LABELS: Record<UpdateOperation["kind"], string> = {
  set: "Set",
  adjust: "Adjust",
  reset: "Reset",
};

function updateOperationFor(
  current: UpdateOperation,
  kind: UpdateOperation["kind"],
): UpdateOperation {
  if (kind === "reset") return { kind: "reset" };
  if (kind === "adjust") {
    if (current.kind === "adjust") return current;
    return {
      kind: "adjust",
      operand: { kind: "literal", value: { kind: "number", value: 1 } },
    };
  }
  if (current.kind === "set") return current;
  return {
    kind: "set",
    operand: { kind: "literal", value: { kind: "text", value: "" } },
  };
}

/** One fact: what it is on the left, what it says on the right. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <SectionRow className="items-baseline">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs" title={value}>
        {value}
      </span>
    </SectionRow>
  );
}

/** A node by name where the graph has one, and by id where it doesn't. */
function endpointLabel(graph: ShowGraph, nodeId: string, path: ValuePath): string {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  const name = node ? `${node.name} (${node.kind})` : nodeId;
  return path.length > 0 ? `${name} · ${path.join(".")}` : name;
}

function UpdateOperationSection({
  edge,
  graph,
  editing,
}: {
  edge: Extract<GraphEdge, { kind: "update" }>;
  graph: ShowGraph;
  editing: GraphInspectorEditing;
}) {
  const action = graph.actions?.find(
    (
      candidate,
    ): candidate is Extract<NonNullable<ShowGraph["actions"]>[number], { kind: "update" }> =>
      candidate.id === edge.actionId && candidate.kind === "update",
  );
  if (!action) return null;
  return (
    <Section label="update">
      <SectionRow>
        <Select
          value={action.operation.kind}
          onValueChange={(value) => {
            if (value === "set" || value === "adjust" || value === "reset") {
              editing.setUpdateOperation(action.id, updateOperationFor(action.operation, value));
            }
          }}
        >
          <SelectTrigger aria-label="Update operation">
            <SelectValue>{UPDATE_OPERATION_LABELS[action.operation.kind]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(UPDATE_OPERATION_LABELS) as UpdateOperation["kind"][]).map((kind) => (
              <SelectItem key={kind} value={kind}>
                {UPDATE_OPERATION_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SectionRow>
      {action.operation.kind === "adjust" ? (
        <SectionRow className="grid-cols-[auto_1fr] items-center">
          <label htmlFor={`update-adjustment-${action.id}`}>Amount</label>
          <Input
            id={`update-adjustment-${action.id}`}
            aria-label="Adjustment amount"
            type="number"
            step="any"
            value={String(
              action.operation.operand.kind === "literal" &&
                action.operation.operand.value.kind === "number" &&
                Number.isFinite(action.operation.operand.value.value)
                ? action.operation.operand.value.value
                : 1,
            )}
            onChange={(event) => {
              if (event.target.value.trim() === "") return;
              const value = Number(event.target.value);
              if (!Number.isFinite(value)) return;
              editing.setUpdateOperand(action.id, {
                kind: "literal",
                value: { kind: "number", value },
              });
            }}
          />
        </SectionRow>
      ) : null}
      <Fact label="Action" value={action.id} />
    </Section>
  );
}

export function SingleEdge({
  edge,
  graph,
  editing,
}: {
  edge: GraphEdge;
  graph: ShowGraph;
  editing: GraphInspectorEditing;
}) {
  // Nudges are keyed by route signature, and a route only wears the set saved
  // under the shape it currently has — so the count is "how many shapes this
  // edge has been dragged in", which is what makes a stale offset visible.
  const nudgedRoutes = Object.keys(edge.layout ?? {});

  return (
    <SidebarContent>
      <Section label="edge">
        <Fact label="Kind" value={KIND_LABEL[edge.kind]} />
        <Fact label="From" value={endpointLabel(graph, edge.sourceId, edge.sourcePath)} />
        <Fact label="To" value={endpointLabel(graph, edge.targetId, edge.targetPath)} />
        <Fact label="Id" value={edge.id} />
      </Section>

      {edge.kind === "navigate" ? (
        <Section label="transition">
          <Fact
            label="Cue"
            value={
              edge.cueId
                ? (graph.cues?.find((cue) => cue.id === edge.cueId)?.name ?? edge.cueId)
                : "—"
            }
          />
          <Fact label="Action" value={edge.actionId ?? "—"} />
        </Section>
      ) : null}

      {edge.kind === "wiring" ? (
        <Section label="value">
          <Fact label="Conversion" value={edge.conversion ?? "—"} />
          <Fact
            label="Field mapping"
            value={
              edge.fieldMapping
                ? Object.entries(edge.fieldMapping)
                    .map(([from, to]) => `${from}→${to}`)
                    .join(", ")
                : "—"
            }
          />
        </Section>
      ) : null}

      {edge.kind === "update" ? (
        <UpdateOperationSection edge={edge} graph={graph} editing={editing} />
      ) : null}
      <Section label="route">
        <Fact
          label="Nudged"
          value={nudgedRoutes.length === 0 ? "—" : `${nudgedRoutes.length} route shapes`}
        />
      </Section>
    </SidebarContent>
  );
}

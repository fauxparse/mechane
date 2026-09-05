// What a selected edge says about itself.
//
// Deliberately a read-out rather than an editor: an edge's only authored
// property today is where its runs were dragged, and that is authored on the
// canvas by dragging them. So this panel exists to answer "which edge is
// that, and what is it carrying" — the questions a graph with several edges
// between the same pair of nodes makes hard to answer by looking.
import { Section, SectionRow, SidebarContent } from "@mechane/design-system";
import type { EdgeKind, GraphEdge, ShowGraph, ValuePath } from "@mechane/domain";

const KIND_LABEL: Record<EdgeKind, string> = {
  wiring: "Wiring",
  navigate: "Navigate",
  update: "Update",
  device: "Device",
};

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

export function SingleEdge({ edge, graph }: { edge: GraphEdge; graph: ShowGraph }) {
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

      <Section label="route">
        <Fact
          label="Nudged"
          value={nudgedRoutes.length === 0 ? "—" : `${nudgedRoutes.length} route shapes`}
        />
      </Section>
    </SidebarContent>
  );
}

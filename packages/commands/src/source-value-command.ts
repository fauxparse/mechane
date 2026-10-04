import type { ShowGraph, SourceFieldDefault } from "@mechane/domain/graph";
import { canonicalValue } from "@mechane/domain/value-transfer";

import { capturing } from "./command";
import type { GraphEdit } from "./graph-edits";
import type { ShowGraphCommand } from "./graph-commands";

const SOURCE_DEFAULT_REPLACEMENT_TYPE = "graph.replaceSourceDefaults";

function ordered(entries: readonly SourceFieldDefault[]): SourceFieldDefault[] {
  return [...entries].sort(
    (left, right) =>
      left.nodeId.localeCompare(right.nodeId) ||
      canonicalValue(left.fieldPath).localeCompare(canonicalValue(right.fieldPath)),
  );
}

function replace(
  graph: ShowGraph,
  expected: readonly SourceFieldDefault[],
  next: readonly SourceFieldDefault[],
): ShowGraph {
  if (
    canonicalValue(ordered(graph.sourceFieldDefaults ?? [])) !== canonicalValue(ordered(expected))
  ) {
    throw new Error("The authored Source Defaults changed. Reload before applying history.");
  }
  return { ...graph, sourceFieldDefaults: structuredClone([...next]) };
}

export function replaceSourceDefaults(
  before: readonly SourceFieldDefault[],
  after: readonly SourceFieldDefault[],
  label = "Paste Source Default",
): ShowGraphCommand {
  const previous = structuredClone([...before]);
  const next = structuredClone([...after]);
  return capturing<ShowGraph, SourceFieldDefault[], GraphEdit>({
    type: SOURCE_DEFAULT_REPLACEMENT_TYPE,
    label,
    scope: "selection",
    edits: [{ type: SOURCE_DEFAULT_REPLACEMENT_TYPE, before: previous, after: next }],
    restoreEdits: (captured) => [
      { type: SOURCE_DEFAULT_REPLACEMENT_TYPE, before: next, after: captured },
    ],
    capture: (graph) => structuredClone(graph.sourceFieldDefaults ?? []),
    apply: (graph) => replace(graph, previous, next),
    restore: (graph, captured) => replace(graph, next, captured),
  });
}

import type { ShowGraph } from "./graph";

/** Sources a set of currently displayed Scenes can read through wiring. */
export function sourceIdsReachableFromScenes(
  graph: ShowGraph,
  sceneIds: readonly string[],
): ReadonlySet<string> {
  const reachable = new Set<string>();
  const visited = new Set<string>();
  const pending = [...sceneIds];
  const wiring = graph.edges.filter((edge) => edge.kind === "wiring");
  while (pending.length > 0) {
    const targetId = pending.pop();
    if (!targetId || visited.has(targetId)) continue;
    visited.add(targetId);
    for (const edge of wiring) {
      if (edge.targetId !== targetId) continue;
      const source = graph.nodes.find((node) => node.id === edge.sourceId);
      if (!source) continue;
      if (source.kind === "source") reachable.add(source.id);
      else if (source.kind === "transformer") pending.push(source.id);
    }
  }
  return reachable;
}

/** Expands changed Sources through downstream wiring/reference closures once per commit. */
export function expandChangedSourceIds(
  graph: ShowGraph,
  changedSourceIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const expanded = new Set(changedSourceIds);
  const pending = [...changedSourceIds];
  while (pending.length > 0) {
    const sourceId = pending.pop();
    if (!sourceId) continue;
    for (const edge of graph.edges) {
      if (edge.kind !== "wiring" || edge.sourceId !== sourceId) continue;
      const target = graph.nodes.find((node) => node.id === edge.targetId);
      if (target?.kind === "source" && !expanded.has(target.id)) {
        expanded.add(target.id);
        pending.push(target.id);
      }
    }
  }
  return expanded;
}


/** Device invalidation predicate for a stable published graph. */
export function deviceReadsChangedSources(
  graph: ShowGraph,
  sceneIds: readonly string[],
  changedSourceIds: ReadonlySet<string>,
): boolean {
  const readSources = sourceIdsReachableFromScenes(graph, sceneIds);
  const changed = expandChangedSourceIds(graph, changedSourceIds);
  for (const sourceId of changed) if (readSources.has(sourceId)) return true;
  return false;
}

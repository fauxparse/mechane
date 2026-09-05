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

/** Device invalidation predicate for a stable published graph. */
export function deviceReadsChangedSources(
  graph: ShowGraph,
  sceneIds: readonly string[],
  changedSourceIds: ReadonlySet<string>,
): boolean {
  const readSources = sourceIdsReachableFromScenes(graph, sceneIds);
  for (const sourceId of changedSourceIds) if (readSources.has(sourceId)) return true;
  return false;
}

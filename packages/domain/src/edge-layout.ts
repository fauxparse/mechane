// What the author has dragged onto an edge, and the grammar it is stored in
// (#475).
//
// Its own module because two things need it and one of them is the other's
// dependency: an edge carries a layout, and so does the Navigate Action an
// edge can be projected from.

/**
 * Authored edge layout: what the user has dragged on an edge, in canvas
 * units, against the shape of the route they dragged it on.
 *
 * The outer key is that *shape* — a string like `"HVH"` naming each run's
 * orientation in order. Keying by shape rather than by index alone is what
 * makes the layout survive the graph moving underneath it: an index into a
 * route of a different shape means nothing, so a route that changes shape
 * leaves the nudges dormant rather than applying them somewhere absurd, and a
 * route that changes back picks them up again.
 *
 * The inner key names one handle — see `edgeLayoutKey`.
 */
export type EdgeLayout = Record<string, Record<string, number>>;

/**
 * Which of a run's two jogs a layout key names. A run that ends at a node
 * cannot be dragged across itself without taking the node's handle with it,
 * so it cuts a jog instead: a stub stays on the handle and the rest of the run
 * steps aside. A single-run route ends at a node at both ends and has both.
 */
export type EdgeLayoutJog = "head" | "tail";

/**
 * The key one handle's drag is stored under.
 *
 * `edgeLayoutKey(1)` is how far run 1 was dragged *across* itself.
 * `edgeLayoutKey(0, "head")` is how far along its run that run's jog cuts.
 *
 * Built here rather than formatted at each end, because both ends have to
 * agree: the editor writes these keys and the edit codec decides which ones
 * are allowed through to the database. A key one side spells differently is a
 * drag that vanishes on the next reload.
 */
export function edgeLayoutKey(runIndex: number, jog?: EdgeLayoutJog): string {
  return jog ? `${runIndex}.${jog}` : `${runIndex}`;
}

/** The handle a layout key names, or null if it names nothing. */
export function parseEdgeLayoutKey(
  key: string,
): { runIndex: number; jog: EdgeLayoutJog | null } | null {
  const [index, jog, ...rest] = key.split(".");
  if (rest.length > 0 || index === undefined || !/^\d+$/.test(index)) return null;
  if (jog !== undefined && jog !== "head" && jog !== "tail") return null;
  return { runIndex: Number(index), jog: jog ?? null };
}

/**
 * The layout an edge should actually carry.
 *
 * A drag of nothing is not a drag: an offset of zero is a handle sitting where
 * routing put it, and a signature whose every handle says that has nothing to
 * remember. Non-finite offsets are dropped outright — a drag through a zero
 * scale produces one, and it would render as `NaN` — as are keys that name no
 * handle, which is what a layout written by a newer editor than this one looks
 * like. Null means "no layout at all", which is what an edge dragged back to
 * its routed shape should be stored as rather than an empty husk.
 */
export function pruneEdgeLayout(layout: EdgeLayout): EdgeLayout | null {
  const pruned: EdgeLayout = {};
  for (const [signature, handles] of Object.entries(layout)) {
    if (!handles || typeof handles !== "object") continue;
    const kept: Record<string, number> = {};
    for (const [key, offset] of Object.entries(handles)) {
      if (!parseEdgeLayoutKey(key) || !Number.isFinite(offset) || offset === 0) continue;
      kept[key] = Number(offset);
    }
    if (Object.keys(kept).length > 0) pruned[signature] = kept;
  }
  return Object.keys(pruned).length > 0 ? pruned : null;
}

// Atomic Show edit lifecycle orchestration (#372): graph-row persistence is
// kept in ./graph-persistence.ts, while Canvas, Device, publication, Run,
// and Player effects stay coordinated here.
//
// Kept out of the resolvers so the GraphQL layer stays a thin adapter: the
// resolvers authenticate, check ownership, validate through the domain, and
// call one of the lifecycle functions below.
import type { CanvasWorkspaceEdit, GraphEdit } from "@mechane/commands";
import { ARTBOARD_COMMAND_TYPES, applyCanvasEdits, applyGraphEdits } from "@mechane/commands";
import type { Canvas, GraphState, ShowGraph } from "@mechane/domain";
import { assertBlockReferencesExist } from "@mechane/domain";
import { and, eq } from "drizzle-orm";
import { runChannel } from "@mechane/realtime";
import { realtimeProvider } from "../realtime";
import type { CanvasWithOwner, StoredCanvas } from "./canvas";
import { readCanvasById, readCanvasWorkspace, writeCanvasRows } from "./canvas";
import { db } from "./client";
import { retireUnreferencedDevices, syncDevices } from "./devices";
import { GraphVersionConflictError, persistGraphRows, readGraphRows } from "./graph-persistence";
import { publishPlayerUpdates, reconcileActiveRunValues, syncActiveRunSourceValues } from "./runs";
import { reconcileSceneCanvases } from "./scene-canvases";
import { devices, showGraphs, shows } from "./schema";
export interface PublishLoss {
  sourceId: string;
  fieldId: string;
  fieldName: string;
  path: string[];
  reason: string;
}

/** A stored graph, plus the row metadata a caller may want to show. */
export interface StoredShowGraph extends ShowGraph {
  showId: string;
  state: GraphState;
  updatedAt: Date;
  /**
   * How many writes this graph has had. A client composes an edit batch
   * against the version it last saw and sends it back, so the server can
   * tell "applied to what I have" from "applied to something else" (#103).
   */
  version: number;
  /** Data loss reported while publishing this graph, if applicable. */
  losses?: PublishLoss[];
}

/**
 * The answer to an edit batch (#111): what the next batch needs to know, and
 * anything the server decided along the way — *not* the graph.
 *
 * Answering a delta with the whole graph would be the same wholesale
 * replacement #103 removed, pointed the other way: the client composed these
 * edits against its own copy and applied them locally before sending, so all
 * it is missing is the version to build on and whatever it couldn't decide
 * for itself.
 */
export interface AppliedShowGraphEdits {
  showId: string;
  state: GraphState;
  updatedAt: Date;
  version: number;
  /** Edits the client should apply to its copy — see `amendments` below. */
  amendments: GraphEdit[];
}

/** The transaction type the graph functions run inside. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Anything a query can run on — the pool, or a transaction on it. Reads take
 * one so a read can be part of the same transaction as the write that
 * follows it, which is what makes read-modify-write on a graph safe (#103).
 */
type Executor = Tx | typeof db;

export { GraphVersionConflictError };

/**
 * Reads graph rows with Device identities supplied by the lifecycle layer.
 * Keeping the graph-row reader free of the devices table makes row mapping
 * independently testable.
 */
export async function readShowGraph(
  showId: string,
  state: GraphState,
  executor: Executor = db,
): Promise<StoredShowGraph> {
  const deviceRows = await executor.select().from(devices).where(eq(devices.showId, showId));
  const deviceIdentities = new Map(
    deviceRows.map((device) => [
      device.id,
      { pairingCode: device.pairingCode, perConnection: device.perConnection },
    ]),
  );
  return readGraphRows(showId, state, deviceIdentities, executor);
}

/**
 * Coordinates graph rows with the effects that intentionally live beside
 * them: Device identity and Scene Canvas reconciliation.
 */
async function writeGraph(
  tx: Tx,
  showId: string,
  state: GraphState,
  graph: ShowGraph,
  expectedVersion?: number,
): Promise<StoredShowGraph> {
  const written = await persistGraphRows(tx, showId, state, graph, expectedVersion);
  const deviceIdentities = await syncDevices(tx, showId, graph.nodes);
  await reconcileSceneCanvases(
    tx,
    written.graphId,
    graph.nodes.filter((node) => node.kind === "scene").map((node) => node.id),
  );
  const nodes = graph.nodes.map((node) => {
    if (node.kind !== "device") return node;
    const identity = deviceIdentities.get(node.id);
    return identity ? { ...node, ...identity } : node;
  });
  return { ...written.graph, nodes };
}
/**
 * Replaces the Show's graph in `state`, in a transaction of its own.
 *
 * The unconditional door into `writeGraph`, used by publish and by seeding.
 * An *edit* goes through `applyShowGraphEdits` instead, which is the one
 * that has a base version to check.
 */
export async function writeShowGraph(
  showId: string,
  state: GraphState,
  graph: ShowGraph,
): Promise<StoredShowGraph> {
  return db.transaction((tx) => writeGraph(tx, showId, state, graph));
}

/**
 * Applies `edits` to the Show's draft graph and stores the result (#103).
 *
 * This is the whole point of the delta protocol landing server-side: the
 * graph the edits apply to is read *here*, under the same lock the write
 * takes, so what the client sent is a description of a change rather than a
 * claim about the whole document. A batch composed against a stale version is
 * refused whole — never partially applied, because half a cascade is a graph
 * nobody asked for.
 *
 * The edits are applied through `@mechane/commands`, which is the same code
 * that produced them in the editor. There is no second implementation of what
 * a delete does, and therefore no way for the two to disagree.
 *
 * Throws `GraphVersionConflictError` on a stale base, `UnknownGraphTargetError`
 * on an edit naming something that isn't there, and `InvalidShowGraphError` if
 * the batch as a whole leaves the graph malformed — intermediate states are
 * not validated, because a cascade legitimately passes through them.
 */
export async function applyShowGraphEdits(
  showId: string,
  edits: readonly GraphEdit[],
  baseVersion: number,
): Promise<AppliedShowGraphEdits> {
  return db.transaction(async (tx) => {
    const current = await readShowGraph(showId, "draft", tx);
    if (current.version !== baseVersion) {
      throw new GraphVersionConflictError(baseVersion, current.version);
    }
    const next = applyGraphEdits(
      {
        shapes: current.shapes ?? [],
        sourceFieldDefaults: current.sourceFieldDefaults ?? [],
        blocks: current.blocks ?? [],
        nodes: current.nodes,
        edges: current.edges,
      },
      edits,
    );
    const written = await writeGraph(tx, showId, "draft", next, baseVersion);
    return {
      showId,
      state: written.state,
      updatedAt: written.updatedAt,
      version: written.version,
      amendments: amendments(next, written),
    };
  });
}

export interface AppliedShowEdits {
  showId: string;
  state: GraphState;
  updatedAt: Date;
  version: number;
  amendments: GraphEdit[];
  canvas: StoredCanvas | null;
}
type EditableCanvas = {
  canvas: Canvas;
  owner: CanvasWithOwner["owner"];
  position: StoredCanvas["position"];
};

/** Applies graph and Canvas edits against one shared Show version transaction.
 *
 * Source value edits also update the active Run and notify paired Players after
 * the transaction commits, so the editor and device views share live values.
 */
export async function applyShowEdits(
  showId: string,
  graphEdits: readonly GraphEdit[],
  canvasEdits: readonly CanvasWorkspaceEdit[],
  baseVersion: number,
): Promise<AppliedShowEdits> {
  const result = await db.transaction(async (tx) => {
    const current = await readShowGraph(showId, "draft", tx);
    if (current.version !== baseVersion) {
      throw new GraphVersionConflictError(baseVersion, current.version);
    }
    const canvasIds = [...new Set(canvasEdits.map((edit) => edit.canvasId))];
    const nextGraph = applyGraphEdits(
      {
        shapes: current.shapes ?? [],
        sourceFieldDefaults: current.sourceFieldDefaults ?? [],
        blocks: current.blocks ?? [],
        nodes: current.nodes,
        edges: current.edges,
      },
      graphEdits,
    );
    // The graph goes down first so a Canvas this batch created — a new Block's (#426) — is there
    // to be read by the Canvas edits that follow it.
    const written = await writeGraph(tx, showId, "draft", nextGraph, baseVersion);
    const currentCanvases = new Map<string, CanvasWithOwner>();
    for (const canvasId of canvasIds) {
      const canvas = await readCanvasById(showId, "draft", canvasId, tx);
      if (!canvas) throw new Error(`Canvas "${canvasId}" was not found.`);
      currentCanvases.set(canvasId, canvas);
    }
    const nextCanvases = new Map<string, EditableCanvas>(
      [...currentCanvases].map(([canvasId, currentCanvas]) => [
        canvasId,
        {
          canvas: currentCanvas.canvas,
          owner: currentCanvas.owner,
          position: { ...currentCanvas.canvas.position },
        },
      ]),
    );
    for (const edit of canvasEdits) {
      const currentCanvas = nextCanvases.get(edit.canvasId);
      if (!currentCanvas) throw new Error(`Canvas "${edit.canvasId}" was not found.`);
      const entry = nextCanvases.get(edit.canvasId)!;
      if (edit.edit.type === ARTBOARD_COMMAND_TYPES.move) {
        entry.position = edit.edit.position;
      } else {
        entry.canvas = applyCanvasEdits(entry.canvas, [edit.edit]);
      }
    }
    const sourceEdits = graphEdits.filter(
      (edit): edit is Extract<GraphEdit, { type: "graph.setSourceFieldDefault" }> =>
        edit.type === "graph.setSourceFieldDefault",
    );
    let playerUpdated = false;
    if (sourceEdits.length > 0) {
      const published = await readShowGraph(showId, "published", tx);
      const liveSourceEdits = sourceEdits.filter((edit) =>
        published.nodes.some((node) => node.kind === "source" && node.id === edit.nodeId),
      );
      if (liveSourceEdits.length > 0) {
        const liveSourceNodeIds = new Set(liveSourceEdits.map((edit) => edit.nodeId));
        const liveGraph = applyGraphEdits(
          {
            shapes: published.shapes ?? [],
            sourceFieldDefaults: published.sourceFieldDefaults ?? [],
            blocks: published.blocks ?? [],
            nodes: published.nodes,
            edges: published.edges,
          },
          liveSourceEdits,
        );
        await writeGraph(tx, showId, "published", liveGraph);
        await syncActiveRunSourceValues(showId, liveGraph, liveSourceNodeIds, tx);
        playerUpdated = true;
      }
    }
    let storedCanvas: StoredCanvas | null = null;
    if (nextCanvases.size > 0) {
      const [graph] = await tx
        .select({ id: showGraphs.id })
        .from(showGraphs)
        .where(and(eq(showGraphs.showId, showId), eq(showGraphs.state, "draft")));
      if (!graph) throw new Error(`Draft graph for Show "${showId}" disappeared while editing.`);
      for (const [canvasId, nextCanvas] of nextCanvases) {
        await writeCanvasRows(
          tx,
          showId,
          graph.id,
          nextCanvas.owner,
          nextCanvas.canvas,
          written.updatedAt,
          nextCanvas.position,
        );
        if (canvasId === canvasIds.at(-1)) {
          storedCanvas = (await readCanvasById(showId, "draft", canvasId, tx))?.canvas ?? null;
        }
      }
    }
    return {
      showId,
      state: written.state,
      updatedAt: written.updatedAt,
      version: written.version,
      amendments: amendments(nextGraph, written),
      canvas: storedCanvas,
      playerUpdated,
    };
  });
  if (result.playerUpdated) await publishPlayerUpdates(showId);
  return result;
}

/**
 * What the server changed that the client didn't ask for, as edits the client
 * can apply to its own copy (#111).
 *
 * Today that is exactly one thing: the pairing code minted for a Device the
 * batch created (#45). The client sent a Device with no code — it can't
 * invent a unique one — and this is how it finds out.
 *
 * Expressed as a diff between the graph the *client* meant to produce and the
 * graph that was stored, so anything else the write decides for itself in
 * future is caught here rather than being quietly dropped on the floor.
 */
function amendments(intended: ShowGraph, written: StoredShowGraph): GraphEdit[] {
  const intendedById = new Map(intended.nodes.map((node) => [node.id, node]));
  const edits: GraphEdit[] = [];
  for (const node of written.nodes) {
    if (node.kind !== "device") continue;
    const before = intendedById.get(node.id);
    if (before?.kind === "device" && before.pairingCode === node.pairingCode) continue;
    edits.push({
      type: "graph.setDevicePairingCode",
      nodeId: node.id,
      pairingCode: node.pairingCode,
    });
  }
  return edits;
}

/**
 * Publishes the Show's draft graph: the published state becomes a copy of
 * the draft, immediately and for the whole Show, per ADR-0002. The draft
 * is left exactly as it is — publishing is a snapshot, not a hand-off, so
 * the director keeps editing from where they were.
 */
export async function publishShowGraph(
  showId: string,
): Promise<
  StoredShowGraph & { losses: Awaited<ReturnType<typeof reconcileActiveRunValues>>["losses"] }
> {
  const result = await db.transaction(async (tx) => {
    await tx.select({ id: shows.id }).from(shows).where(eq(shows.id, showId)).for("update");
    const draft = await readShowGraph(showId, "draft", tx);
    const draftCanvases = await readCanvasWorkspace(showId, "draft", tx);
    assertBlockReferencesExist(draft.blocks ?? [], draftCanvases.canvases);
    const publishedBefore = await readShowGraph(showId, "published", tx);
    const reconciled = await reconcileActiveRunValues(showId, publishedBefore, draft, tx);
    const published = await writeGraph(tx, showId, "published", {
      shapes: draft.shapes ?? [],

      blocks: draft.blocks ?? [],
      nodes: draft.nodes,
      edges: draft.edges,
    });
    // Publish is the only moment a Device may be retired (#45). Keeping this
    // in the same transaction preserves the all-or-nothing cutover.
    await retireUnreferencedDevices(tx, showId);
    return { published, reconciled };
  });

  if (result.reconciled.runId) {
    await realtimeProvider.channel(runChannel(result.reconciled.runId)).publish("run.cutover", {
      graph: result.published,
      sourceValues: result.reconciled.sourceValues,
      losses: result.reconciled.losses,
    });
  }
  await publishPlayerUpdates(showId);

  return { ...result.published, losses: result.reconciled.losses };
}

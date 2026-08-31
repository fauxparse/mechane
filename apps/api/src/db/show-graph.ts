// Atomic Show edit lifecycle orchestration (#372): graph-row persistence is
// kept in ./graph-persistence.ts, while Canvas, Device, publication, Run,
// and Player effects stay coordinated here.
//
// Kept out of the resolvers so the GraphQL layer stays a thin adapter: the
// resolvers authenticate, check ownership, validate through the domain, and
// call one of the lifecycle functions below.
import type { CanvasWorkspaceEdit, GraphEdit } from "@mechane/commands";
import { applyGraphEdits } from "@mechane/commands";
import type { GraphState, ShowGraph } from "@mechane/domain";
import { assertBlockReferencesExist } from "@mechane/domain";
import { eq } from "drizzle-orm";
import type { StoredCanvas } from "./canvas";
import { persistCanvases, readCanvasById, readCanvasWorkspace } from "./canvas";
import { db } from "./client";
import { retireUnreferencedDevices, syncDevices } from "./devices";
import {
  GraphVersionConflictError,
  persistEventBindings,
  persistGraphRows,
  readGraphRows,
} from "./graph-persistence";
import { drainPlayerInvalidations, enqueuePlayerInvalidations } from "./player-invalidation-outbox";
import {
  reconcileActiveRunDeviceStates,
  reconcileActiveRunValues,
  syncActiveRunSourceValues,
} from "./runs";
import { devices, shows } from "./schema";
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

interface WriteGraphOptions {
  readonly canvasEdits?: readonly CanvasWorkspaceEdit[];
  readonly forceBlockCanvasWrites: boolean;
}

/** Coordinates graph rows, owned Canvases, and Device identity in one write. */
async function writeGraph(
  tx: Tx,
  showId: string,
  state: GraphState,
  graph: ShowGraph,
  expectedVersion: number | undefined,
  options: WriteGraphOptions,
): Promise<StoredShowGraph> {
  const written = await persistGraphRows(tx, showId, state, graph, expectedVersion);
  await persistCanvases(tx, {
    showId,
    state,
    graphId: written.graphId,
    blocks: graph.blocks ?? [],
    sceneIds: graph.nodes.filter((node) => node.kind === "scene").map((node) => node.id),
    edits: options.canvasEdits ?? [],
    now: written.graph.updatedAt,
    forceBlockWrites: options.forceBlockCanvasWrites,
  });
  const eventBindings = await persistEventBindings(tx, written.graphId, graph.eventBindings ?? []);
  const deviceIdentities = await syncDevices(tx, showId, graph.nodes);
  const nodes = graph.nodes.map((node) => {
    if (node.kind !== "device") return node;
    const identity = deviceIdentities.get(node.id);
    return identity ? { ...node, ...identity } : node;
  });
  return { ...written.graph, eventBindings, nodes };
}
/**
 * Replaces the Show's graph in `state`, in a transaction of its own.
 *
 * The unconditional door into `writeGraph`, used by publish and by seeding.
 */
export async function writeShowGraph(
  showId: string,
  state: GraphState,
  graph: ShowGraph,
): Promise<StoredShowGraph> {
  return db.transaction((tx) =>
    writeGraph(tx, showId, state, graph, undefined, { forceBlockCanvasWrites: true }),
  );
}

export interface AppliedShowEdits {
  showId: string;
  state: GraphState;
  updatedAt: Date;
  version: number;
  amendments: GraphEdit[];
  canvas: StoredCanvas | null;
}

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
    const nextGraph = applyGraphEdits(
      {
        shapes: current.shapes ?? [],
        sourceFieldDefaults: current.sourceFieldDefaults ?? [],
        blocks: current.blocks ?? [],
        cues: current.cues ?? [],
        actions: current.actions ?? [],
        eventBindings: current.eventBindings ?? [],
        nodes: current.nodes,
        edges: current.edges,
      },
      graphEdits,
    );
    const written = await writeGraph(tx, showId, "draft", nextGraph, baseVersion, {
      canvasEdits,
      forceBlockCanvasWrites: false,
    });
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
            cues: published.cues ?? [],
            actions: published.actions ?? [],
            eventBindings: published.eventBindings ?? [],
            nodes: published.nodes,
            edges: published.edges,
          },
          liveSourceEdits,
        );
        await writeGraph(tx, showId, "published", liveGraph, undefined, {
          forceBlockCanvasWrites: true,
        });
        const updated = await syncActiveRunSourceValues(showId, liveGraph, liveSourceNodeIds, tx);
        if (updated) {
          await enqueuePlayerInvalidations(tx, showId);
          playerUpdated = true;
        }
      }
    }
    const lastCanvasId = canvasEdits.at(-1)?.canvasId;
    const storedCanvas = lastCanvasId
      ? ((await readCanvasById(showId, "draft", lastCanvasId, tx))?.canvas ?? null)
      : null;
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
  if (result.playerUpdated) {
    try {
      await drainPlayerInvalidations({ showId });
    } catch {
      // The worker retries the committed outbox row if the provider is down.
    }
  }
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
    const published = await writeGraph(
      tx,
      showId,
      "published",
      {
        shapes: draft.shapes ?? [],
        sourceFieldDefaults: draft.sourceFieldDefaults ?? [],
        blocks: draft.blocks ?? [],
        cues: draft.cues ?? [],
        actions: draft.actions ?? [],
        eventBindings: draft.eventBindings ?? [],
        nodes: draft.nodes,
        edges: draft.edges,
      },
      undefined,
      { forceBlockCanvasWrites: true },
    );
    await reconcileActiveRunDeviceStates(showId, published, published.version, tx);
    // Publish is the only moment a Device may be retired (#45). Keeping this
    // in the same transaction preserves the all-or-nothing cutover.
    await retireUnreferencedDevices(tx, showId);
    await enqueuePlayerInvalidations(tx, showId);
    return { published, reconciled };
  });
  try {
    await drainPlayerInvalidations({ showId });
  } catch {
    // The worker retries the committed outbox row if the provider is down.
  }

  return { ...result.published, losses: result.reconciled.losses };
}

// Atomic Show edit lifecycle orchestration (#372): graph-row persistence is
// kept in ./graph-persistence.ts, while Canvas, Device, publication, Run,
// and Player effects stay coordinated here.
//
// Kept out of the resolvers so the GraphQL layer stays a thin adapter: the
// resolvers authenticate, check ownership, validate through the domain, and
// call one of the lifecycle functions below.
import { applyGraphEdits, deletionScope, interactionDeletionIds } from "@mechane/commands";
import type { CanvasWorkspaceEdit, GraphEdit } from "@mechane/commands";
import { assertBlockReferencesExist, InvalidBlockError } from "@mechane/domain/blocks";
import {
  diagnoseCanvasFormulas,
  type ElementPropertyResolutionContext,
} from "@mechane/domain/element-properties";
import {
  InvalidShowGraphError,
  normaliseShowGraphVariableNames,
  type GraphState,
  type ShowGraph,
} from "@mechane/domain/graph";
import { generateId, type StructuredValueId } from "@mechane/domain/id";
import { hasUnpublishedChanges, publishState } from "@mechane/domain/publish";
import { defaultValueForType } from "@mechane/domain/source-defaults";
import type { RuntimeValue, StructuredValues } from "@mechane/domain/structured-values";
import { and, eq, inArray } from "drizzle-orm";
import type { StoredCanvas } from "./canvas";
import { persistCanvases, readCanvasById, readCanvasWorkspace } from "./canvas";
import { db } from "./client";
import { customDomainsProvider } from "../custom-domains/active-provider";
import { unbindDomainsOfDevices } from "../custom-domains/bindings";
import { LIVE_CUSTOM_DOMAIN_STATUSES } from "../custom-domains/hostname";
import { evictResolvedHostnames } from "../custom-domains/live-address-effects";
import type { CustomDomainsProvider } from "../custom-domains/provider";
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
import { customDomains, devices, showGraphs, shows } from "./schema";
import { withUniqueId } from "./ids";
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

export class CanvasFormulaPublicationError extends Error {
  constructor(
    readonly diagnostics: readonly {
      readonly canvasId: string;
      readonly elementId: string;
      readonly property: string;
      readonly message: string;
    }[],
  ) {
    super(
      `Cannot publish: ${diagnostics.length} Element Formula ${
        diagnostics.length === 1 ? "diagnostic" : "diagnostics"
      } must be fixed.`,
    );
    this.name = "CanvasFormulaPublicationError";
  }
}

function blockingCanvasFormulaDiagnostics(
  graph: ShowGraph,
  canvases: readonly StoredCanvas[],
): CanvasFormulaPublicationError["diagnostics"] {
  const diagnostics: {
    canvasId: string;
    elementId: string;
    property: string;
    message: string;
  }[] = [];
  for (const canvas of canvases) {
    const variables =
      canvas.kind === "block"
        ? (graph.blocks?.find((block) => block.id === canvas.ownerId)?.variables ?? [])
        : (() => {
            const scene = graph.nodes.find(
              (node) => node.kind === "scene" && node.id === canvas.ownerId,
            );
            return scene?.kind === "scene" ? scene.variables : [];
          })();
    const contextValues = Object.fromEntries(
      variables.map((variable) => [
        variable.id,
        "defaultValue" in variable
          ? variable.defaultValue
          : defaultValueForType(variable.type ?? "text", graph.shapes ?? []),
      ]),
    );
    const structuredValues: StructuredValues = {};
    const itemVariable =
      canvas.kind === "block"
        ? variables.find(
            (variable) =>
              variable.type !== null &&
              variable.type !== undefined &&
              typeof variable.type === "object" &&
              variable.type.kind === "shape",
          )
        : undefined;
    const itemRef = "__publication_formula_item" as StructuredValueId;
    const itemType = itemVariable?.type;
    const runtimeContext =
      itemType && typeof itemType === "object" && itemType.kind === "shape"
        ? { item: { ref: itemRef }, type: itemType, index: 0 }
        : undefined;
    if (itemType && typeof itemType === "object" && itemType.kind === "shape") {
      const value = defaultValueForType(itemType, graph.shapes ?? []);
      structuredValues[itemRef] = {
        id: itemRef,
        kind: "shape",
        type: itemType,
        fields: (value ?? {}) as Record<string, RuntimeValue>,
      };
    }
    const context: ElementPropertyResolutionContext = {
      variables: variables.flatMap((variable) =>
        variable.type
          ? [
              {
                id: variable.id,
                name: variable.name,
                type: variable.type,
                ...("defaultValue" in variable ? { defaultValue: variable.defaultValue } : {}),
              },
            ]
          : [],
      ),
      values: contextValues,
      structuredValues,
      shapes: graph.shapes ?? [],
      ...(runtimeContext ? { runtimeContext } : {}),
    };
    for (const diagnostic of diagnoseCanvasFormulas(canvas, context)) {
      if (diagnostic.severity !== "blocking") continue;
      diagnostics.push({
        canvasId: canvas.id,
        elementId: diagnostic.elementId,
        property: diagnostic.property,
        message: diagnostic.message,
      });
    }
  }
  return diagnostics;
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
  // A Device's live Custom Domain is read through like its pairing code, so
  // links, QR codes and Address outputs in Studio and every Player agree.
  const liveDomains = await executor
    .select({ deviceId: customDomains.deviceId, hostname: customDomains.hostname })
    .from(customDomains)
    .where(
      and(
        eq(customDomains.deviceShowId, showId),
        inArray(customDomains.status, [...LIVE_CUSTOM_DOMAIN_STATUSES]),
      ),
    );
  const deviceIdentities = new Map(
    deviceRows.map((device) => [
      device.id,
      {
        pairingCode: device.pairingCode,
        perConnection: device.perConnection,
        liveDomain: liveDomains.find((domain) => domain.deviceId === device.id)?.hostname ?? null,
      },
    ]),
  );
  return readGraphRows(showId, state, deviceIdentities, executor);
}

interface WriteGraphOptions {
  readonly canvasEdits?: readonly CanvasWorkspaceEdit[];
  /** Scene Canvases to copy with their Element trees, during publication. */
  readonly sceneCanvases?: readonly StoredCanvas[];
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
  graph = normaliseShowGraphVariableNames(graph);
  const written = await persistGraphRows(tx, showId, state, graph, expectedVersion);
  await persistCanvases(tx, {
    showId,
    state,
    graphId: written.graphId,
    blocks: graph.blocks ?? [],
    sceneIds: graph.nodes.filter((node) => node.kind === "scene").map((node) => node.id),
    edits: options.canvasEdits ?? [],
    sceneCanvases: options.sceneCanvases,
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
 * Creates a new Show with the starter Scene and shared projector Device
 * (#606). A Show that auto-publishes (#856) — every new Show, by default —
 * publishes the starter graph with it, so its Devices show the Scene before
 * the first edit.
 */
export async function createShowWithDefaults(name: string, userId: string) {
  const { show, publication } = await withUniqueId("show", (id) =>
    db.transaction(async (tx) => {
      const [show] = await tx.insert(shows).values({ id, name, userId }).returning();
      if (!show) throw new Error("The new Show could not be created.");

      const sceneId = generateId("scene");
      const deviceId = generateId("device");
      await writeGraph(
        tx,
        show.id,
        "draft",
        {
          nodes: [
            {
              id: sceneId,
              kind: "scene",
              name: "New Scene",
              position: { x: 0, y: 0 },
              parentId: null,
              variables: [],
            },
            {
              id: deviceId,
              kind: "device",
              name: "Projector",
              position: { x: 500, y: 0 },
              parentId: null,
              perConnection: false,
              pairingCode: null,
            },
          ],
          edges: [
            {
              id: generateId("edge"),
              kind: "device",
              sourceId: sceneId,
              targetId: deviceId,
              sourcePath: [],
              targetPath: [],
            },
          ],
        } satisfies ShowGraph,
        undefined,
        { forceBlockCanvasWrites: true },
      );
      if (!show.autoPublish) return { show, publication: null };
      const publication = await publishDraft(tx, show.id);
      // Publication moves the Show's state sequence and timestamp.
      const [current] = await tx.select().from(shows).where(eq(shows.id, show.id));
      if (!current) throw new Error("The new Show could not be created.");
      return { show: current, publication };
    }),
  );
  if (publication) await afterPublication(show.id, publication);
  return show;
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
  /**
   * The published graph the batch was published as, when the Show
   * auto-publishes and the resulting draft was publishable (#856).
   */
  published: { updatedAt: Date; version: number } | null;
}

/**
 * A raw node deletion can arrive without the Studio cascade when an older
 * client or a batched Canvas edit removes a Scene. Remove the interaction edits
 * that would otherwise keep referring to that Scene before graph validation.
 */
function sceneInteractionCleanupEdits(
  graph: ShowGraph,
  graphEdits: readonly GraphEdit[],
): GraphEdit[] {
  const nodeIds = graphEdits
    .filter(
      (edit): edit is Extract<GraphEdit, { type: "graph.removeNode" }> =>
        edit.type === "graph.removeNode",
    )
    .map((edit) => edit.nodeId);
  if (nodeIds.length === 0) return [];

  const scope = deletionScope(graph, nodeIds);
  const doomed = new Set(scope.nodes.map((node) => node.id));
  const { cueIds: allCueIds, actionIds: allActionIds } = interactionDeletionIds(graph, doomed);
  const removedCueIds = new Set(
    graphEdits
      .filter(
        (edit): edit is Extract<GraphEdit, { type: "graph.removeCue" }> =>
          edit.type === "graph.removeCue",
      )
      .map((edit) => edit.cueId),
  );
  const removedActionIds = new Set(
    graphEdits
      .filter(
        (edit): edit is Extract<GraphEdit, { type: "graph.removeAction" }> =>
          edit.type === "graph.removeAction",
      )
      .map((edit) => edit.actionId),
  );
  const cueIds = allCueIds.filter((cueId) => !removedCueIds.has(cueId));
  const allRemovedCueIds = new Set([...removedCueIds, ...cueIds]);
  const actionIds = allActionIds.filter((actionId) => {
    const action = graph.actions?.find((candidate) => candidate.id === actionId);
    return (
      action !== undefined &&
      !allRemovedCueIds.has(action.cueId) &&
      !removedActionIds.has(action.id)
    );
  });
  return [
    ...cueIds.map((cueId) => ({ type: "graph.removeCue" as const, cueId })),
    ...actionIds.map((actionId) => ({ type: "graph.removeAction" as const, actionId })),
  ];
}

/** Applies graph and Canvas edits against one shared Show version transaction.
 *
 * Source value edits also update the active Run and notify paired Players after
 * the transaction commits, so the editor and device views share live values.
 * A Show that auto-publishes (#856) publishes the new draft in the same
 * transaction, so the edit and its cutover commit or fail together.
 */
export async function applyShowEdits(
  showId: string,
  graphEdits: readonly GraphEdit[],
  canvasEdits: readonly CanvasWorkspaceEdit[],
  baseVersion: number,
  options: { customDomainsProvider?: CustomDomainsProvider } = {},
): Promise<AppliedShowEdits> {
  const { applied, publication, playerUpdated } = await db.transaction(async (tx) => {
    // Taken before the draft row, in the order publication takes them, so an
    // edit batch and a concurrent publish cannot deadlock.
    const { autoPublish } = await lockShow(tx, showId);
    const current = await readShowGraph(showId, "draft", tx);
    if (current.version !== baseVersion) {
      throw new GraphVersionConflictError(baseVersion, current.version);
    }
    const currentGraph: ShowGraph = {
      shapes: current.shapes ?? [],
      sourceFieldDefaults: current.sourceFieldDefaults ?? [],
      blocks: current.blocks ?? [],
      cues: current.cues ?? [],
      actions: current.actions ?? [],
      eventBindings: current.eventBindings ?? [],
      slotEventBindings: current.slotEventBindings ?? [],
      nodes: current.nodes,
      edges: current.edges,
    };
    const cleanupEdits = sceneInteractionCleanupEdits(currentGraph, graphEdits);
    const appliedGraphEdits = [...cleanupEdits, ...graphEdits];
    const nextGraph = applyGraphEdits(currentGraph, appliedGraphEdits);
    const written = await writeGraph(tx, showId, "draft", nextGraph, baseVersion, {
      canvasEdits,
      forceBlockCanvasWrites: false,
    });
    const lastCanvasId = canvasEdits.at(-1)?.canvasId;
    const storedCanvas = lastCanvasId
      ? ((await readCanvasById(showId, "draft", lastCanvasId, tx))?.canvas ?? null)
      : null;
    const editedSourceIds = new Set(
      graphEdits
        .filter(
          (edit): edit is Extract<GraphEdit, { type: "graph.setSourceFieldDefault" }> =>
            edit.type === "graph.setSourceFieldDefault",
        )
        .map((edit) => edit.nodeId),
    );
    const playerUpdated = await syncActiveRunSourceValues(showId, nextGraph, editedSourceIds, tx);
    const publication = autoPublish ? await publishDraftIfPublishable(tx, showId) : null;
    // Publication already notifies every Device.
    if (playerUpdated && !publication) await enqueuePlayerInvalidations(tx, showId);
    return {
      applied: {
        showId,
        state: written.state,
        updatedAt: written.updatedAt,
        version: written.version,
        amendments: [...cleanupEdits, ...amendments(nextGraph, written)],
        canvas: storedCanvas,
        published: publication && {
          updatedAt: publication.published.updatedAt,
          version: publication.published.version,
        },
      },
      publication,
      playerUpdated,
    };
  });
  if (publication) {
    await afterPublication(showId, publication, options.customDomainsProvider);
  } else if (playerUpdated) {
    try {
      await drainPlayerInvalidations({ showId });
    } catch {
      // The worker retries the committed outbox row if the provider is down.
    }
  }
  return applied;
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

interface Publication {
  published: StoredShowGraph;
  losses: PublishLoss[];
  /** Live hostnames released with retired Devices, evicted after commit. */
  unboundLiveHostnames: string[];
}

/** Takes the Show row lock that publication and Run start serialise on. */
async function lockShow(tx: Tx, showId: string): Promise<{ autoPublish: boolean }> {
  const [show] = await tx
    .select({ autoPublish: shows.autoPublish })
    .from(shows)
    .where(eq(shows.id, showId))
    .for("update");
  if (!show) throw new Error(`Show "${showId}" was not found.`);
  return show;
}

/**
 * Copies the draft over the published graph inside the caller's transaction,
 * which must already hold the Show row lock. The draft is left exactly as it
 * is — publishing is a snapshot, not a hand-off, so the director keeps
 * editing from where they were.
 */
async function publishDraft(tx: Tx, showId: string): Promise<Publication> {
  const draft = await readShowGraph(showId, "draft", tx);
  const draftCanvases = await readCanvasWorkspace(showId, "draft", tx);
  assertBlockReferencesExist(draft.blocks ?? [], draftCanvases.canvases);
  const formulaDiagnostics = blockingCanvasFormulaDiagnostics(draft, draftCanvases.canvases);
  if (formulaDiagnostics.length > 0) {
    throw new CanvasFormulaPublicationError(formulaDiagnostics);
  }
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
      slotEventBindings: draft.slotEventBindings ?? [],
      nodes: draft.nodes,
      edges: draft.edges,
    },
    undefined,
    {
      sceneCanvases: draftCanvases.canvases.filter((canvas) => canvas.kind === "scene"),
      forceBlockCanvasWrites: true,
    },
  );
  await reconcileActiveRunDeviceStates(showId, published, published.version, tx);
  // Publish is the only moment a Device may be retired (#45). Keeping this
  // in the same transaction preserves the all-or-nothing cutover. A
  // retired Device's Custom Domain is released with it.
  const retired = await retireUnreferencedDevices(tx, showId);
  const unboundLiveHostnames = await unbindDomainsOfDevices(tx, showId, retired);
  await enqueuePlayerInvalidations(tx, showId);
  return { published, losses: reconciled.losses, unboundLiveHostnames };
}

/**
 * Publishes the draft if it can be published, for a Show that auto-publishes
 * (#856). A draft mid-edit is routinely unpublishable — a Transformer still
 * waiting for its Formula — and that must not refuse the edit that made it
 * so: the published graph simply stays where it was until an edit makes the
 * draft publishable again. The savepoint discards whatever publication had
 * already written, Run reconciliation included, before it refused.
 */
async function publishDraftIfPublishable(tx: Tx, showId: string): Promise<Publication | null> {
  try {
    return await tx.transaction((savepoint) => publishDraft(savepoint, showId));
  } catch (error) {
    if (
      error instanceof CanvasFormulaPublicationError ||
      error instanceof InvalidShowGraphError ||
      error instanceof InvalidBlockError
    ) {
      return null;
    }
    throw error;
  }
}

/** Publication's effects outside the database, once its transaction commits. */
async function afterPublication(
  showId: string,
  publication: Publication,
  provider: CustomDomainsProvider = customDomainsProvider,
): Promise<void> {
  await evictResolvedHostnames(provider, publication.unboundLiveHostnames);
  try {
    await drainPlayerInvalidations({ showId });
  } catch {
    // The worker retries the committed outbox row if the provider is down.
  }
}

/**
 * Publishes the Show's draft graph: the published state becomes a copy of
 * the draft, immediately and for the whole Show, per ADR-0002.
 */
export async function publishShowGraph(
  showId: string,
  options: { customDomainsProvider?: CustomDomainsProvider } = {},
): Promise<StoredShowGraph & { losses: PublishLoss[] }> {
  const publication = await db.transaction(async (tx) => {
    await lockShow(tx, showId);
    return publishDraft(tx, showId);
  });
  await afterPublication(showId, publication, options.customDomainsProvider);
  return { ...publication.published, losses: publication.losses };
}

/**
 * Turns a Show's auto-publication on or off (#856). Turning it on publishes a
 * draft that is ahead of the published graph, in the same transaction: the
 * Studio hides the Publish control from an auto-publishing Show, so a pending
 * draft left behind would have no way to go out until the next edit.
 */
export async function setShowAutoPublish(
  showId: string,
  autoPublish: boolean,
  options: { customDomainsProvider?: CustomDomainsProvider } = {},
): Promise<typeof shows.$inferSelect> {
  const { show, publication } = await db.transaction(async (tx) => {
    await lockShow(tx, showId);
    const [show] = await tx
      .update(shows)
      .set({ autoPublish, updatedAt: new Date() })
      .where(eq(shows.id, showId))
      .returning();
    if (!show) throw new Error(`Show "${showId}" was not found.`);
    if (!autoPublish) return { show, publication: null };
    const graphs = await tx
      .select({ state: showGraphs.state, updatedAt: showGraphs.updatedAt })
      .from(showGraphs)
      .where(eq(showGraphs.showId, showId));
    const updatedAt = new Map(graphs.map((graph) => [graph.state, graph.updatedAt]));
    const pending = hasUnpublishedChanges(
      publishState(
        updatedAt.get("draft") ?? new Date(0),
        updatedAt.get("published") ?? new Date(0),
      ),
    );
    return { show, publication: pending ? await publishDraftIfPublishable(tx, showId) : null };
  });
  if (publication) await afterPublication(showId, publication, options.customDomainsProvider);
  return show;
}

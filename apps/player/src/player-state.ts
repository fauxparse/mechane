import type { ShowGraph } from "@mechane/domain/graph";
import type { Action, UpdateAction } from "@mechane/domain/interactions";
import { PAIRING_CODE_PATTERN } from "@mechane/domain/pairing-code";
import { defaultSourceValueTemplates } from "@mechane/domain/source-defaults";
import {
  composeInstanceView,
  materializeInstanceState,
  type RunState,
  type SourceValues,
  type StructuredValues,
} from "@mechane/domain/structured-values";
import {
  applyUpdateWrites,
  planUpdate,
  resolveUpdateHolderScope,
} from "@mechane/domain/update-plan";

import type { PlayerActionEvidence } from "./api";

export { sceneVariableValues } from "@mechane/domain/scene-variable-values";

const STORAGE_PREFIX = "mechane.player:";
const CLAIM_PREFIX = "mechane.player-claim:";
const CURRENT_SCHEMA_VERSION = 1;

export type PlayerDeviceIdentity = string & { readonly __brand: "PlayerDeviceIdentity" };
export type PlayerRunId = string & { readonly __brand: "PlayerRunId" };

export interface PlayerRunScope {
  readonly deviceIdentity: PlayerDeviceIdentity;
  readonly runId: PlayerRunId;
}

export function playerRunScope(pairingCode: string, runId: string): PlayerRunScope {
  const deviceIdentity = pairingCode.trim().toUpperCase();
  const normalizedRunId = runId.trim();
  if (!isPlayerDeviceIdentity(deviceIdentity)) {
    throw new TypeError("Player pairing code is invalid.");
  }
  if (!isPlayerRunId(normalizedRunId)) throw new TypeError("Player Run ID is required.");
  return {
    deviceIdentity,
    runId: normalizedRunId,
  };
}

export function isPlayerDeviceIdentity(value: string): value is PlayerDeviceIdentity {
  return PAIRING_CODE_PATTERN.test(value);
}

export function isPlayerRunId(value: string): value is PlayerRunId {
  return value.length > 0;
}

export type PlayerNavigation =
  | { readonly kind: "not-ready" }
  | { readonly kind: "scene"; readonly sceneId: string };

export interface PlayerRunState {
  readonly schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  readonly publishedGraphVersion: number;
  readonly flowId: string;
  readonly navigation: PlayerNavigation;
  readonly flowSourceValues: SourceValues;
  readonly flowStructuredValues: StructuredValues;
  readonly shuffleSeeds?: Readonly<Record<string, string>>;
}

/** A Show Action of a Cue, with the Instance values it read when it ran (#883). */
export interface PendingShowAction {
  readonly action: UpdateAction;
  readonly evidence: PlayerActionEvidence;
}

/**
 * A Show write this Player has made that its latest snapshot does not hold yet
 * (#886). The Player keeps these in memory, never in its store: after a
 * reload the server's state is the truth.
 */
export interface PendingShowEvent {
  readonly eventId: string;
  readonly sceneId: string;
  /** In declared order. */
  readonly actions: readonly PendingShowAction[];
  /** The Show's sequence once the Event committed; unknown until acknowledged (#885). */
  readonly acknowledgedStateSequence?: number;
}

/**
 * Runs one Show Action against a copy of Show scope the way the server does
 * (#883): the holder resolves through the evidence's Instance values, and the
 * writes land in Show scope. Seeded with the Event id, a fresh record gets
 * the identity the server will give it (#884).
 */
function planShowAction(
  graph: ShowGraph,
  show: RunState,
  sceneId: string,
  eventId: string,
  { action, evidence }: PendingShowAction,
):
  | { readonly kind: "planned"; readonly show: RunState }
  | { readonly kind: "failed"; readonly reason: string } {
  const routed: RunState = {
    sourceValues: { ...show.sourceValues, ...(evidence.sourceValues as SourceValues) },
    structuredValues: show.structuredValues,
  };
  const plan = planUpdate(graph, routed, sceneId, action, eventId, evidence.cueParameters);
  if (plan.kind === "failed") return plan;
  return { kind: "planned", show: applyUpdateWrites(show, plan.writes) };
}

/**
 * Drops the pending Events a snapshot at `stateSequence` already holds: those
 * acknowledged at or below it. Until the server acknowledges an Event, no
 * snapshot holds it.
 */
export function settlePendingShowEvents(
  pending: readonly PendingShowEvent[],
  stateSequence: number,
): readonly PendingShowEvent[] {
  const settled = pending.filter(
    (event) =>
      event.acknowledgedStateSequence === undefined ||
      event.acknowledgedStateSequence > stateSequence,
  );
  return settled.length === pending.length ? pending : settled;
}

/**
 * What the server's answer means for a Show write this Player predicted:
 * keep it until a snapshot at `stateSequence` holds it, drop it because the
 * server wrote nothing, or drop it and roll the Cue back because the server
 * refused the Cue or never answered.
 */
export type ShowWriteOutcome =
  | { readonly kind: "acknowledged"; readonly stateSequence: number }
  | { readonly kind: "dropped" }
  | { readonly kind: "rolled-back" };

/** The pending queue once the server has answered for `eventId`. */
export function resolvePendingShowEvent(
  pending: readonly PendingShowEvent[],
  eventId: string,
  outcome: ShowWriteOutcome,
): readonly PendingShowEvent[] {
  if (outcome.kind !== "acknowledged") return pending.filter((event) => event.eventId !== eventId);
  return pending.map((event) =>
    event.eventId === eventId
      ? { ...event, acknowledgedStateSequence: outcome.stateSequence }
      : event,
  );
}

/**
 * Show scope as this Player displays it: the latest snapshot with every
 * pending Event it does not hold yet replayed over it in tap order.
 *
 * The queue holds Events rather than a predicted state, so a vote someone
 * else cast is never hidden behind one computed before it arrived: each
 * snapshot is the new base, and only this Player's own writes go on top. An
 * Event whose replay fails adds nothing, as it would on the server.
 */
export function displayedShowState(
  graph: ShowGraph,
  snapshot: RunState,
  stateSequence: number,
  pending: readonly PendingShowEvent[],
): RunState {
  let show = snapshot;
  for (const event of settlePendingShowEvents(pending, stateSequence)) {
    let staged = show;
    let planned = true;
    for (const entry of event.actions) {
      const plan = planShowAction(graph, staged, event.sceneId, event.eventId, entry);
      if (plan.kind === "failed") {
        planned = false;
        break;
      }
      staged = plan.show;
    }
    if (planned) show = staged;
  }
  return show;
}

export type PlayerCueExecution =
  | {
      readonly kind: "applied";
      readonly state: PlayerRunState;
      /** The Actions the server runs, in declared order. */
      readonly showActions: readonly PendingShowAction[];
    }
  | { readonly kind: "failed"; readonly actionId: string; readonly reason: string };

/**
 * Executes a Cue's Actions in declared order against one Player Instance and
 * its view of Show scope.
 *
 * Whether a write is the server's or this Player's is the *resolved* holder's
 * question, not the target Source's. A Flow-local Source addressed with a
 * field path can hold a reference into a Show-owned record — `selected.votes`
 * where `selected` references a Candidate — and that write belongs to the
 * server however Flow-local the Source naming it is. `showState` is what
 * makes the holder reachable; without it such an Action would resolve against
 * Instance scope alone and be applied locally, where nobody else can see it.
 *
 * A Show Action's evidence is the staged Instance state at the point it runs
 * (#628), so the server resolves its holder through the value an earlier
 * Action wrote, and a later Action's write cannot change what it read. Its
 * writes are staged into this Player's copy of Show scope, so a later Action
 * reads them as it will on the server; that copy is only ever displayed
 * through the pending queue (#886).
 */
export function applyPlayerCue(
  state: PlayerRunState,
  graph: ShowGraph,
  actions: readonly Action[],
  sceneId: string,
  eventId: string,
  cueParameterValues: Readonly<Record<string, unknown>> = {},
  showState: RunState = { sourceValues: {}, structuredValues: {} },
): PlayerCueExecution {
  let next = state;
  let show = showState;
  const showActions: PendingShowAction[] = [];
  for (const action of actions) {
    if (action.kind === "navigate") {
      next = { ...next, navigation: { kind: "scene", sceneId: action.targetSceneId } };
      continue;
    }
    const instanceState: RunState = {
      sourceValues: next.flowSourceValues,
      structuredValues: next.flowStructuredValues,
    };
    const composed = composeInstanceView(show, instanceState);
    if (resolveUpdateHolderScope(graph, composed, action) === "show") {
      const entry: PendingShowAction = {
        action,
        evidence: { sourceValues: next.flowSourceValues, cueParameters: cueParameterValues },
      };
      const plan = planShowAction(graph, show, sceneId, eventId, entry);
      if (plan.kind === "failed")
        return { kind: "failed", actionId: action.id, reason: plan.reason };
      show = plan.show;
      showActions.push(entry);
      continue;
    }
    // Reads may reach Show scope; only the writes are confined to the
    // Instance layer, which is where an Instance-scoped holder lives.
    const plan = planUpdate(graph, composed, sceneId, action, eventId, cueParameterValues);
    if (plan.kind === "failed") {
      return { kind: "failed", actionId: action.id, reason: plan.reason };
    }
    const updated = applyUpdateWrites(instanceState, plan.writes);
    next = {
      ...next,
      flowSourceValues: updated.sourceValues,
      flowStructuredValues: updated.structuredValues,
    };
  }
  return { kind: "applied", state: next, showActions };
}

function sameInstanceState(left: PlayerRunState, right: PlayerRunState): boolean {
  return (
    JSON.stringify([left.navigation, left.flowSourceValues, left.flowStructuredValues]) ===
    JSON.stringify([right.navigation, right.flowSourceValues, right.flowStructuredValues])
  );
}

/**
 * The Instance state a Cue whose Show write failed leaves behind (#886).
 *
 * The Cue's Instance writes and navigation are undone only while Instance
 * state is still exactly what the Cue left. Once a later Cue has built on
 * them they stay, so a failure never undoes a tap that came after it — at the
 * cost of sometimes leaving the voter where the failed Cue sent them. `null`
 * means leave the current state alone.
 */
export function rollBackPlayerCue(
  current: PlayerRunState,
  before: PlayerRunState,
  after: PlayerRunState,
): PlayerRunState | null {
  if (!sameInstanceState(current, after)) return null;
  return {
    ...current,
    navigation: before.navigation,
    flowSourceValues: before.flowSourceValues,
    flowStructuredValues: before.flowStructuredValues,
  };
}

export type PlayerStoreStatus = {
  readonly durability: "persistent" | "memory";
  readonly ownership: "unclaimed" | "active" | "superseded" | "closed";
};

export interface PlayerStorageAdapter {
  readonly length: number;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface PlayerStorageChange {
  readonly key: string | null;
  readonly newValue: string | null;
}

export interface PlayerStateEnvironment {
  readonly storage?: PlayerStorageAdapter | null;
  readonly subscribeStorage?: (listener: (change: PlayerStorageChange) => void) => () => void;
  readonly randomToken?: () => string;
}

export interface PlayerStateStore {
  readonly scope: PlayerRunScope;
  getStatus(): PlayerStoreStatus;
  read(): PlayerRunState | null;
  replace(state: PlayerRunState): boolean;
  subscribe(listener: () => void): () => void;
  claim(): boolean;
  takeOver(): boolean;
  close(): void;
}

export type PlayerDriver =
  | {
      readonly kind: "flow";
      readonly flowId: string;
      readonly defaultSceneId: string | null;
      readonly sceneIds: ReadonlySet<string>;
      readonly flowSourceIds?: ReadonlySet<string>;
      readonly publishedGraphVersion: number;
    }
  | { readonly kind: "scene" }
  | { readonly kind: "unwired" };

export type PlayerReconciliation =
  | {
      readonly kind: "preserve";
      readonly state: PlayerRunState;
      readonly reason: "same-scene" | "not-ready";
    }
  | {
      readonly kind: "reset";
      readonly state: PlayerRunState;
      readonly reason: "initialization" | "flow-changed" | "scene-invalid" | "missing-default";
    }
  | { readonly kind: "discard"; readonly reason: "driver-not-flow" }
  | { readonly kind: "stale-snapshot"; readonly state: PlayerRunState };

export function reconcilePlayerRunState(
  current: PlayerRunState | null,
  driver: PlayerDriver,
): PlayerReconciliation {
  if (driver.kind !== "flow") return { kind: "discard", reason: "driver-not-flow" };
  if (current && current.publishedGraphVersion > driver.publishedGraphVersion) {
    return { kind: "stale-snapshot", state: current };
  }

  const sourceValues =
    current?.flowId === driver.flowId
      ? Object.fromEntries(
          Object.entries(current.flowSourceValues).filter(
            ([sourceId]) => !driver.flowSourceIds || driver.flowSourceIds.has(sourceId),
          ),
        )
      : {};
  const structuredValues = current?.flowId === driver.flowId ? current.flowStructuredValues : {};
  const shuffleSeeds = current?.flowId === driver.flowId ? (current.shuffleSeeds ?? {}) : {};
  const defaultNavigation: PlayerNavigation = driver.defaultSceneId
    ? { kind: "scene", sceneId: driver.defaultSceneId }
    : { kind: "not-ready" };
  const nextState = (navigation: PlayerNavigation): PlayerRunState => ({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    publishedGraphVersion: driver.publishedGraphVersion,
    flowId: driver.flowId,
    navigation,
    flowSourceValues: sourceValues,
    flowStructuredValues: structuredValues,
    shuffleSeeds,
  });

  if (!current) {
    return {
      kind: "reset",
      state: nextState(defaultNavigation),
      reason: driver.defaultSceneId ? "initialization" : "missing-default",
    };
  }
  if (current.flowId !== driver.flowId) {
    return { kind: "reset", state: nextState(defaultNavigation), reason: "flow-changed" };
  }
  if (current.navigation.kind === "scene" && driver.sceneIds.has(current.navigation.sceneId)) {
    return {
      kind: "preserve",
      state: nextState(current.navigation),
      reason: "same-scene",
    };
  }
  if (current.navigation.kind === "not-ready" && !driver.defaultSceneId) {
    return { kind: "preserve", state: nextState(current.navigation), reason: "not-ready" };
  }
  return {
    kind: "reset",
    state: nextState(defaultNavigation),
    reason: driver.defaultSceneId ? "scene-invalid" : "missing-default",
  };
}
/** Materializes defaults and stable Shuffle seeds for newly introduced Flow-local state. */
export function initializePlayerInstanceState(
  state: PlayerRunState,
  graph: ShowGraph,
): PlayerRunState {
  const defaults = materializeInstanceState(
    graph,
    state.flowId,
    defaultSourceValueTemplates(graph),
  );
  const shuffleSeeds = { ...state.shuffleSeeds };
  for (const node of graph.nodes) {
    if (
      node.kind === "transformer" &&
      node.parentId === state.flowId &&
      node.transform.kind === "shuffle" &&
      !shuffleSeeds[node.id]
    ) {
      shuffleSeeds[node.id] = globalThis.crypto.randomUUID();
    }
  }
  return {
    ...state,
    flowSourceValues: { ...defaults.sourceValues, ...state.flowSourceValues },
    flowStructuredValues: { ...defaults.structuredValues, ...state.flowStructuredValues },
    shuffleSeeds,
  };
}

export interface PlayerTransitionCoordinator {
  run<T>(operation: () => T | PromiseLike<T>): Promise<T>;
}
export function playerTransitionCoordinator(): PlayerTransitionCoordinator {
  let tail = Promise.resolve();
  return {
    run<T>(operation: () => T | PromiseLike<T>): Promise<T> {
      const result = tail.then(() => operation());
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value);
}

function stateKey(scope: PlayerRunScope): string {
  return `${STORAGE_PREFIX}${encodeKeyPart(scope.deviceIdentity)}:${encodeKeyPart(scope.runId)}`;
}

function claimKey(scope: PlayerRunScope): string {
  return `${CLAIM_PREFIX}${encodeKeyPart(scope.deviceIdentity)}:${encodeKeyPart(scope.runId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNavigation(value: unknown): value is PlayerNavigation {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "not-ready") return true;
  return value.kind === "scene" && typeof value.sceneId === "string" && value.sceneId.length > 0;
}

function isSourceValues(value: unknown): value is SourceValues {
  return isRecord(value);
}

function decodeState(value: string): PlayerRunState | "newer" | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return typeof parsed.schemaVersion === "number" && parsed.schemaVersion > CURRENT_SCHEMA_VERSION
      ? "newer"
      : null;
  }
  if (
    typeof parsed.publishedGraphVersion !== "number" ||
    !Number.isInteger(parsed.publishedGraphVersion) ||
    parsed.publishedGraphVersion < 0 ||
    typeof parsed.flowId !== "string" ||
    !isNavigation(parsed.navigation) ||
    !isSourceValues(parsed.flowSourceValues) ||
    (parsed.flowStructuredValues !== undefined && !isRecord(parsed.flowStructuredValues)) ||
    (parsed.shuffleSeeds !== undefined && !isRecord(parsed.shuffleSeeds))
  ) {
    return null;
  }
  const flowStructuredValues = isRecord(parsed.flowStructuredValues)
    ? (parsed.flowStructuredValues as StructuredValues)
    : {};
  const shuffleSeeds = isRecord(parsed.shuffleSeeds)
    ? Object.fromEntries(
        Object.entries(parsed.shuffleSeeds).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : {};
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    publishedGraphVersion: parsed.publishedGraphVersion,
    flowId: parsed.flowId,
    navigation: parsed.navigation,
    flowSourceValues: parsed.flowSourceValues,
    flowStructuredValues,
    ...(parsed.shuffleSeeds === undefined ? {} : { shuffleSeeds }),
  };
}

function browserEnvironment(): PlayerStateEnvironment {
  if (typeof window === "undefined") return {};
  let storage: PlayerStorageAdapter | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  return {
    storage,
    subscribeStorage: (listener) => {
      const onStorage = (event: StorageEvent) =>
        listener({ key: event.key, newValue: event.newValue });
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
    randomToken: () => window.crypto.randomUUID(),
  };
}

function removeDeviceRecords(
  storage: PlayerStorageAdapter,
  scope: PlayerRunScope,
  keepRun: boolean,
): void {
  const statePrefix = `${STORAGE_PREFIX}${encodeKeyPart(scope.deviceIdentity)}:`;
  const claimPrefix = `${CLAIM_PREFIX}${encodeKeyPart(scope.deviceIdentity)}:`;
  const state = stateKey(scope);
  const claim = claimKey(scope);
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && (key.startsWith(statePrefix) || key.startsWith(claimPrefix))) keys.push(key);
  }
  for (const key of keys) {
    if (keepRun && (key === state || key === claim)) continue;
    storage.removeItem(key);
  }
}

export function cleanupPlayerRunState(
  scope: PlayerRunScope,
  environment: PlayerStateEnvironment = browserEnvironment(),
): void {
  const storage = environment.storage;
  if (!storage) return;
  try {
    removeDeviceRecords(storage, scope, true);
  } catch {
    // Storage cleanup is best effort; the active scope remains usable in memory.
  }
}

export function clearPlayerDeviceState(
  pairingCode: string,
  environment: PlayerStateEnvironment = browserEnvironment(),
): void {
  const scope = playerRunScope(pairingCode, "cleanup");
  const storage = environment.storage;
  if (!storage) return;
  try {
    removeDeviceRecords(storage, scope, false);
  } catch {
    // Clearing stale client state must never block the Player.
  }
}

export function openPlayerStateStore(
  scope: PlayerRunScope,
  environment: PlayerStateEnvironment = browserEnvironment(),
): PlayerStateStore {
  const storage = environment.storage ?? null;
  const dataKey = stateKey(scope);
  const activeClaimKey = claimKey(scope);
  let durability: "persistent" | "memory" = storage ? "persistent" : "memory";
  let ownership: "unclaimed" | "active" | "superseded" | "closed" = "unclaimed";
  let pageToken: string | null = null;
  let memoryState: PlayerRunState | null = null;
  const listeners = new Set<() => void>();
  const unsubscribeStorage = environment.subscribeStorage?.((change) => {
    if (ownership === "closed") return;
    if (change.key === activeClaimKey && ownership === "active" && change.newValue !== pageToken) {
      ownership = "superseded";
      listeners.forEach((listener) => listener());
      return;
    }
    if (change.key === dataKey) listeners.forEach((listener) => listener());
  });

  const useMemory = () => {
    durability = "memory";
  };
  const read = (): PlayerRunState | null => {
    if (durability === "memory" || !storage) return memoryState;
    try {
      const raw = storage.getItem(dataKey);
      if (raw === null) return memoryState;
      const decoded = decodeState(raw);
      if (decoded === "newer") {
        useMemory();
        return memoryState;
      }
      if (decoded === null) {
        storage.removeItem(dataKey);
        return memoryState;
      }
      memoryState = decoded;
      return decoded;
    } catch {
      useMemory();
      return memoryState;
    }
  };
  const replace = (state: PlayerRunState): boolean => {
    if (ownership === "superseded" || ownership === "closed") return false;
    memoryState = state;
    if (durability === "persistent" && storage) {
      try {
        storage.setItem(dataKey, JSON.stringify(state));
      } catch {
        try {
          storage.removeItem(dataKey);
        } catch {
          // The in-memory state remains authoritative for this page.
        }
        useMemory();
      }
    }
    listeners.forEach((listener) => listener());
    return true;
  };
  const claim = (): boolean => {
    if (ownership === "closed") return false;
    pageToken ??= environment.randomToken?.() ?? crypto.randomUUID();
    if (durability === "persistent" && storage) {
      try {
        storage.setItem(activeClaimKey, pageToken);
      } catch {
        useMemory();
      }
    }
    ownership = "active";
    listeners.forEach((listener) => listener());
    return true;
  };
  const close = () => {
    if (ownership === "closed") return;
    if (storage && durability === "persistent" && ownership === "active") {
      try {
        if (storage.getItem(activeClaimKey) === pageToken) storage.removeItem(activeClaimKey);
      } catch {
        useMemory();
      }
    }
    ownership = "closed";
    unsubscribeStorage?.();
    listeners.clear();
  };

  cleanupPlayerRunState(scope, { ...environment, storage });
  return {
    scope,
    getStatus: () => ({ durability, ownership }),
    read,
    replace,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    claim,
    takeOver: () => claim(),
    close,
  };
}

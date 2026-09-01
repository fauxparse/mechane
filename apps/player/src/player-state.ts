import type { SourceValues } from "@mechane/domain";

export { sceneVariableValues } from "@mechane/domain";

const PAIRING_CODE_PATTERN = /^[1-9A-HJ-KM-NP-Z]{5}$/;
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

  const sourceValues = current?.flowId === driver.flowId ? current.flowSourceValues : {};
  const defaultNavigation: PlayerNavigation = driver.defaultSceneId
    ? { kind: "scene", sceneId: driver.defaultSceneId }
    : { kind: "not-ready" };
  const nextState = (navigation: PlayerNavigation): PlayerRunState => ({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    publishedGraphVersion: driver.publishedGraphVersion,
    flowId: driver.flowId,
    navigation,
    flowSourceValues: sourceValues,
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
    parsed.flowId.length === 0 ||
    !isNavigation(parsed.navigation) ||
    !isSourceValues(parsed.flowSourceValues)
  ) {
    return null;
  }
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    publishedGraphVersion: parsed.publishedGraphVersion,
    flowId: parsed.flowId,
    navigation: parsed.navigation,
    flowSourceValues: parsed.flowSourceValues,
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

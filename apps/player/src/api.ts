import type { Canvas } from "@mechane/domain/canvas";
import type { GraphNode, SceneNode, ShowGraph, TransformerNode } from "@mechane/domain/graph";
import type { SourceValues, StructuredValues } from "@mechane/domain/structured-values";
import type { RealtimeSubscriber, RealtimeSubscription } from "@mechane/realtime";
import { AblyRealtimeSubscriber, WebSocketRealtimeSubscriber } from "@mechane/realtime/browser";
import {
  GetPlayerRealtimeGrantQuery,
  GetPlayerRunStateQuery,
  GetPlayerSessionQuery,
  SubmitPlayerEventMutation,
  graphqlRequest,
} from "@mechane/graphql-schema";
import { useCallback, useEffect, useRef, useState } from "react";
import { defaultApiBaseUrl, shouldUseRealtimeSocket } from "./api-url";
import { normalizePlayerSession } from "./player-mappers";
import {
  invalidatedStateSequence,
  mergePlayerRunSnapshot,
  predatesPlayerSession,
  type PlayerRunSnapshot,
  sequencedReads,
  usableRealtimeGrant,
} from "./player-run-refresh";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ??
  defaultApiBaseUrl(import.meta.env.PROD, import.meta.env.VITE_DEV_PROXY === "true");
export const GRAPHQL_ENDPOINT = `${API_BASE_URL}/api/graphql`;
const USE_REALTIME_SOCKET = shouldUseRealtimeSocket(
  import.meta.env.PROD,
  import.meta.env.VITE_DEV_PROXY === "true",
);

export type PlayerSession = {
  device: {
    name: string;
    perConnection: boolean;
  };
  realtime: {
    channel: string;
    grant: string;
    expiresAt: string;
  };
  /**
   * Opaque. Changes whenever anything here other than the Run's values does,
   * which is how a Player knows a run-state read is enough (#881).
   */
  sessionKey: string;
  run: {
    id: string;
    showId: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    stateSequence: number;
    sourceValues: SourceValues;
    shuffleSeeds?: Readonly<Record<string, string>>;
    structuredValues: StructuredValues;
  } | null;
  graph: ShowGraph;
  /**
   * The version of the published graph this session read (ADR-0006, #742).
   * A fact about the read rather than about the graph: it is what an Event
   * submitted from this session is stamped with.
   */
  graphVersion: number;
  flow: {
    flowId: string;
    defaultSceneId: string | null;
    transformers: TransformerNode[];
    scenes: Array<{
      scene: SceneNode;
      canvas: Canvas & { id: string; ownerId: string; ownerName: string };
    }>;
  } | null;
  scene: Extract<GraphNode, { kind: "scene" }> | null;
  canvas: (Canvas & { id: string; ownerId: string; ownerName: string }) | null;
  blocks: ShowGraph["blocks"];
  imageAssets: Array<{
    assetId: string;
    revision: string;
    url: string;
    width: number;
    height: number;
    alt: string;
    mimeType: string;
    blurHash: string | null;
  }>;
};

export class PlayerRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PlayerRequestError";
  }
}

export async function fetchPlayerSession(
  code: string,
  { signal, connecting = false }: { signal?: AbortSignal; connecting?: boolean } = {},
): Promise<PlayerSession> {
  const result = await graphqlRequest(
    GRAPHQL_ENDPOINT,
    GetPlayerSessionQuery,
    { connecting },
    {
      signal,
      credentials: "omit",
      headers: { Authorization: `Bearer ${code.trim().toUpperCase()}` },
    },
  );
  if (!result.playerSession) {
    throw new PlayerRequestError("That pairing code is not active.", 404);
  }
  return normalizePlayerSession(result.playerSession, API_BASE_URL);
}

/** The Run values alone, without the rest of the session (#881). */
export async function fetchPlayerRunState(
  code: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<PlayerRunSnapshot | null> {
  const result = await graphqlRequest(
    GRAPHQL_ENDPOINT,
    GetPlayerRunStateQuery,
    {},
    {
      signal,
      credentials: "omit",
      headers: { Authorization: `Bearer ${code.trim().toUpperCase()}` },
    },
  );
  const runState = result.playerRunState;
  return runState
    ? {
        sessionKey: runState.sessionKey,
        stateSequence: runState.stateSequence,
        sourceValues: runState.sourceValues as SourceValues,
        structuredValues: runState.structuredValues as StructuredValues,
      }
    : null;
}

/** A fresh realtime grant, without the rest of the session. */
export async function fetchPlayerRealtimeGrant(
  code: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<PlayerSession["realtime"] | null> {
  const result = await graphqlRequest(
    GRAPHQL_ENDPOINT,
    GetPlayerRealtimeGrantQuery,
    {},
    {
      signal,
      credentials: "omit",
      headers: { Authorization: `Bearer ${code.trim().toUpperCase()}` },
    },
  );
  return result.playerRealtimeGrant;
}

export type BlockInstancePathSegment = {
  slotElementId: string;
  index: number;
};

export type PlayerEventInput = {
  eventId: string;
  publishedGraphVersion: number;
  sceneId: string;
  /** For a keypress this is the Canvas root, which is what Canvas scope means. */
  elementId: string;
  /** Root-to-leaf Slot instance indices; the server re-resolves them. */
  slotInstancePath?: readonly BlockInstancePathSegment[];
  /** Per Show Action, keyed by Action id: values resolved at the point it ran. */
  evidence?: Readonly<Record<string, PlayerActionEvidence>>;
} & ({ eventKind: "tap" } | { eventKind: "keypress"; params: { key: string } });

export type PlayerActionEvidence = {
  readonly sourceValues: Readonly<Record<string, unknown>>;
  readonly cueParameters: Readonly<Record<string, unknown>>;
};

/**
 * `stateSequence` on an applied or accepted result is the Show's sequence once
 * the Event committed: a snapshot at or past it already holds the Event. A
 * duplicate reports the original's, or null when it had none.
 */
export type PlayerEventResult =
  | {
      kind: "applied";
      eventId: string;
      resultingSceneId: string;
      changed: boolean;
      stateSequence: number;
    }
  | {
      kind: "duplicate";
      eventId: string;
      outcome: "applied" | "ignored" | "failed" | "accepted" | "rejected";
      changed: boolean;
      resultingSceneId: string | null;
      reason: string | null;
      stateSequence: number | null;
    }
  | { kind: "ignored"; eventId: string; reason: string }
  | { kind: "failed"; eventId: string; actionId: string; reason: string }
  | { kind: "accepted"; eventId: string; stateSequence: number }
  | { kind: "rejected"; eventId: string; reason: string };

export async function submitPlayerEvent(
  code: string,
  input: PlayerEventInput,
): Promise<PlayerEventResult> {
  const result = await graphqlRequest(
    GRAPHQL_ENDPOINT,
    SubmitPlayerEventMutation,
    // `slotInstancePath` is readonly in the domain and mutable in the
    // generated input; the copy is the whole difference.
    {
      input: {
        ...input,
        slotInstancePath: input.slotInstancePath ? [...input.slotInstancePath] : undefined,
      },
    },
    { credentials: "omit", headers: { Authorization: `Bearer ${code.trim().toUpperCase()}` } },
  );
  const event = result.submitPlayerEvent;
  if (!event) throw new PlayerRequestError("Unable to process that Event.", 500);
  if (event.__typename === "PlayerEventApplied") {
    return {
      kind: "applied",
      eventId: String(event.eventId),
      resultingSceneId: String(event.appliedResultingSceneId),
      changed: event.changed,
      stateSequence: event.stateSequence,
    };
  }
  if (event.__typename === "PlayerEventDuplicate") {
    return {
      kind: "duplicate",
      eventId: String(event.eventId),
      outcome: event.outcome as "applied" | "ignored" | "failed" | "accepted" | "rejected",
      changed: event.changed,
      resultingSceneId: event.duplicateResultingSceneId
        ? String(event.duplicateResultingSceneId)
        : null,
      reason: event.duplicateReason ? String(event.duplicateReason) : null,
      stateSequence: event.duplicateStateSequence ?? null,
    };
  }
  if (event.__typename === "PlayerEventIgnored") {
    return {
      kind: "ignored",
      eventId: String(event.eventId),
      reason: String(event.ignoredReason),
    };
  }
  if (event.__typename === "PlayerEventFailed") {
    return {
      kind: "failed",
      eventId: String(event.eventId),
      actionId: String(event.actionId),
      reason: String(event.failedReason),
    };
  }
  if (event.__typename === "PlayerEventAccepted") {
    return {
      kind: "accepted",
      eventId: String(event.eventId),
      stateSequence: event.stateSequence,
    };
  }
  if (event.__typename === "PlayerEventRejected") {
    return {
      kind: "rejected",
      eventId: String(event.eventId),
      reason: String(event.rejectedReason),
    };
  }
  throw new PlayerRequestError("Unable to process that Event.", 500);
}
function realtimeUrl(): string {
  const url = new URL("/api/realtime", API_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
function realtimeAuthUrl(grant: string): string {
  return `${API_BASE_URL}/api/realtime/auth?grant=${encodeURIComponent(grant)}`;
}

type PlayerRealtimeSubscriber = RealtimeSubscriber & { close(): void };

export type PlayerEventSubmitter = (input: PlayerEventInput) => Promise<PlayerEventResult>;

export type PlayerState = {
  submitEvent?: PlayerEventSubmitter;
} & (
  | { status: "idle" }
  | { status: "loading"; session: PlayerSession | null }
  | { status: "ready"; session: PlayerSession }
  | { status: "error"; message: string; notFound: boolean }
);

export function usePlayerSession(code: string): PlayerState {
  const normalizedCode = code.trim().toUpperCase();
  const [state, setState] = useState<PlayerState>({ status: "idle" });
  // Owned by the effect below, which holds the session it compares against.
  // An Event result asks for the same refresh an invalidation does.
  const refreshRunState = useRef<(stateSequence: number) => void>(() => undefined);

  const submitEvent = useCallback<PlayerEventSubmitter>(
    async (input) => {
      const result = await submitPlayerEvent(normalizedCode, input);
      if ("stateSequence" in result && result.stateSequence !== null) {
        refreshRunState.current(result.stateSequence);
      }
      return result;
    },
    [normalizedCode],
  );
  // The subscription is created after the GraphQL snapshot resolves and is
  // closed explicitly below; React Doctor cannot follow that nested ownership.
  // Every state update after an `await` in here returns early on
  // `controller.signal.aborted`, which the cleanup sets, but inside nested
  // closures React Doctor cannot see that guard either.
  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup, react-doctor/no-set-state-after-await-in-effect
  useEffect(() => {
    const controller = new AbortController();
    let held: PlayerSession | null = null;
    // The newest grant this Player has: its session's, or a renewal's.
    let grant: PlayerSession["realtime"] | null = null;
    let subscription: RealtimeSubscription | null = null;
    let subscriber: PlayerRealtimeSubscriber | null = null;
    let currentChannel: string | null = null;
    let closed = false;

    const show = (session: PlayerSession) => {
      held = session;
      setState({ status: "ready", session });
    };

    // `connecting` is the first read, the one that joins the Device; every
    // later read is a refresh. Only the first shows a loading state, and only
    // it tells the API someone is trying to connect (#467).
    const load = async (connecting: boolean) => {
      if (connecting)
        setState((current) => ({
          status: "loading",
          session: current.status === "ready" ? current.session : null,
        }));
      try {
        const session = await fetchPlayerSession(normalizedCode, {
          signal: controller.signal,
          connecting,
        });
        if (controller.signal.aborted) return null;
        if (!predatesPlayerSession(held, session)) {
          show(session);
          grant = session.realtime;
        }
        return session;
      } catch (error) {
        const requestError = error instanceof PlayerRequestError ? error : null;
        if (!controller.signal.aborted) {
          setState({
            status: "error",
            message:
              requestError?.message ?? "Unable to connect. Check your network and try again.",
            notFound: requestError?.status === 404,
          });
        }
        return null;
      }
    };

    const clearRealtime = () => {
      subscription?.close();
      subscription = null;
      subscriber?.close();
      subscriber = null;
    };

    const reload = async () => {
      const fresh = await load(false);
      if (fresh) attach(fresh);
      return fresh;
    };

    // Most invalidations move only the Run's values, so only those are read
    // again; the whole session follows when they say it has to (#881).
    const readRunState = sequencedReads(
      async () => {
        if (!held) {
          await reload();
          return;
        }
        let runState: PlayerRunSnapshot | null;
        try {
          runState = await fetchPlayerRunState(normalizedCode, { signal: controller.signal });
        } catch {
          // The whole-session read is the one that reports what went wrong.
          if (!controller.signal.aborted) await reload();
          return;
        }
        if (controller.signal.aborted || !held) return;
        const merge = mergePlayerRunSnapshot(held, runState);
        if (merge.kind === "updated") show(merge.session);
        if (merge.kind === "session-changed") await reload();
      },
      () => held?.run?.stateSequence,
    );
    refreshRunState.current = readRunState;

    const attach = (session: PlayerSession): boolean => {
      if (closed) return false;
      if (session.realtime.channel === currentChannel && subscriber) return false;

      clearRealtime();
      currentChannel = session.realtime.channel;
      // A subscriber asks for a grant on every (re)connection. Whatever
      // changed while it was not subscribed has no invalidation left to
      // announce it, so every ask is also a run-state read.
      const renewGrant = async () => {
        readRunState();
        const usable = usableRealtimeGrant(grant, Date.now());
        if (usable) return usable;
        try {
          const fresh = await fetchPlayerRealtimeGrant(normalizedCode, {
            signal: controller.signal,
          });
          if (fresh) {
            grant = fresh;
            return fresh.grant;
          }
        } catch {
          if (controller.signal.aborted) return null;
        }
        // No grant means no Device, or no network; the session read reports which.
        return (await reload())?.realtime.grant ?? null;
      };
      subscriber = USE_REALTIME_SOCKET
        ? new WebSocketRealtimeSubscriber(realtimeUrl(), renewGrant)
        : new AblyRealtimeSubscriber(
            realtimeAuthUrl(session.realtime.grant),
            session.realtime.channel,
            renewGrant,
          );
      subscription = subscriber.subscribe((message) => {
        readRunState(invalidatedStateSequence(message));
      });
      return true;
    };

    const connect = async () => {
      const session = await load(true);
      if (session) attach(session);
    };

    void connect();
    return () => {
      closed = true;
      refreshRunState.current = () => undefined;
      controller.abort();
      subscription?.close();
      subscriber?.close();
    };
  }, [normalizedCode]);

  return { ...state, submitEvent };
}

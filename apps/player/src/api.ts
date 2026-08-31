import type { Canvas, GraphNode, ShowGraph, SourceValues } from "@mechane/domain";
import type { RealtimeSubscriber, RealtimeSubscription } from "@mechane/realtime";
import { AblyRealtimeSubscriber, WebSocketRealtimeSubscriber } from "@mechane/realtime/browser";
import {
  GetPlayerSessionQuery,
  SubmitPlayerEventMutation,
  graphqlRequest,
} from "@mechane/graphql-schema";
import { useCallback, useEffect, useState } from "react";
import { defaultApiBaseUrl, shouldUseRealtimeSocket } from "./api-url";
import { normalizePlayerSession } from "./player-mappers";

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
  run: {
    id: string;
    showId: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    sourceValues: SourceValues;
  } | null;
  graph: ShowGraph & {
    showId: string;
    state: string;
    updatedAt: string;
    version: number;
  };
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
  signal?: AbortSignal,
): Promise<PlayerSession> {
  const result = await graphqlRequest(
    GRAPHQL_ENDPOINT,
    GetPlayerSessionQuery,
    {},
    { signal, headers: { Authorization: `Bearer ${code.trim().toUpperCase()}` } },
  );
  if (!result.playerSession) {
    throw new PlayerRequestError("That pairing code is not active.", 404);
  }
  return normalizePlayerSession(result.playerSession, API_BASE_URL);
}

export interface PlayerEventInput {
  eventId: string;
  sceneId: string;
  elementId: string;
  eventKind: "tap";
}

export type PlayerEventResult =
  | { kind: "applied"; eventId: string; resultingSceneId: string }
  | {
      kind: "duplicate";
      eventId: string;
      outcome: "applied" | "ignored";
      resultingSceneId: string | null;
      reason: string | null;
    }
  | { kind: "ignored"; eventId: string; reason: string };

export async function submitPlayerEvent(
  code: string,
  input: PlayerEventInput,
): Promise<PlayerEventResult> {
  const result = await graphqlRequest(
    GRAPHQL_ENDPOINT,
    SubmitPlayerEventMutation,
    { input },
    { headers: { Authorization: `Bearer ${code.trim().toUpperCase()}` } },
  );
  const event = result.submitPlayerEvent;
  if (!event) throw new PlayerRequestError("Unable to process that Event.", 500);
  if (event.__typename === "PlayerEventApplied") {
    return {
      kind: "applied",
      eventId: String(event.eventId),
      resultingSceneId: String(event.appliedResultingSceneId),
    };
  }
  if (event.__typename === "PlayerEventDuplicate") {
    return {
      kind: "duplicate",
      eventId: String(event.eventId),
      outcome: event.outcome === "applied" ? "applied" : "ignored",
      resultingSceneId: event.duplicateResultingSceneId
        ? String(event.duplicateResultingSceneId)
        : null,
      reason: event.duplicateReason ? String(event.duplicateReason) : null,
    };
  }
  if (event.__typename === "PlayerEventIgnored") {
    return {
      kind: "ignored",
      eventId: String(event.eventId),
      reason: String(event.ignoredReason),
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

type PlayerEventSubmitter = (input: PlayerEventInput) => Promise<PlayerEventResult>;

type PlayerState = {
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

  const load = useCallback(
    async (signal: AbortSignal, showLoading: boolean) => {
      if (showLoading)
        setState((current) => ({
          status: "loading",
          session: current.status === "ready" ? current.session : null,
        }));
      try {
        const session = await fetchPlayerSession(normalizedCode, signal);
        if (!signal.aborted) setState({ status: "ready", session });
        return session;
      } catch (error) {
        if (signal.aborted) return null;
        const requestError = error instanceof PlayerRequestError ? error : null;
        setState({
          status: "error",
          message: requestError?.message ?? "Unable to connect. Check your network and try again.",
          notFound: requestError?.status === 404,
        });
        return null;
      }
    },
    [normalizedCode],
  );
  const submitEvent = useCallback<PlayerEventSubmitter>(
    async (input) => {
      const result = await submitPlayerEvent(normalizedCode, input);
      if (result.kind === "applied") {
        const session = await fetchPlayerSession(normalizedCode);
        setState({ status: "ready", session });
      }
      return result;
    },
    [normalizedCode],
  );
  // The subscription is created after the GraphQL snapshot resolves and is
  // closed explicitly below; React Doctor cannot follow that nested ownership.
  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    const controller = new AbortController();
    let subscription: RealtimeSubscription | null = null;
    let subscriber: PlayerRealtimeSubscriber | null = null;
    let currentChannel: string | null = null;
    let closed = false;

    const clearRealtime = () => {
      subscription?.close();
      subscription = null;
      subscriber?.close();
      subscriber = null;
    };

    const attach = (session: PlayerSession): boolean => {
      if (closed) return false;
      if (session.realtime.channel === currentChannel && subscriber) return false;

      clearRealtime();
      currentChannel = session.realtime.channel;
      subscriber = USE_REALTIME_SOCKET
        ? new WebSocketRealtimeSubscriber(realtimeUrl(), async () => {
            const fresh = await load(controller.signal, false);
            if (fresh) attach(fresh);
            return fresh?.realtime.grant ?? null;
          })
        : new AblyRealtimeSubscriber(
            realtimeAuthUrl(session.realtime.grant),
            session.realtime.channel,
            async () => {
              const fresh = await load(controller.signal, false);
              if (fresh) attach(fresh);
              return fresh?.realtime.grant ?? null;
            },
          );
      subscription = subscriber.subscribe(() => {
        void refresh(false, false);
      });
      return true;
    };

    const refresh = async (showLoading: boolean, closeSnapshotRace: boolean) => {
      const session = await load(controller.signal, showLoading);
      if (!session) return;
      const attached = attach(session);
      if (attached && closeSnapshotRace) {
        const latest = await load(controller.signal, false);
        if (latest) attach(latest);
      }
    };

    void refresh(true, true);
    return () => {
      closed = true;
      controller.abort();
      subscription?.close();
      subscriber?.close();
    };
  }, [load, normalizedCode]);

  return { ...state, submitEvent };
}

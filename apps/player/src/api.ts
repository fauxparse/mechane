import type { Canvas, GraphNode, ShowGraph, SourceValues } from "@mechane/domain";
import type { RealtimeSubscriber, RealtimeSubscription } from "@mechane/realtime";
import { playerChannel } from "@mechane/realtime";
import { AblyRealtimeSubscriber, WebSocketRealtimeSubscriber } from "@mechane/realtime/browser";
import { GetPlayerSessionQuery, graphqlRequest } from "@mechane/graphql-schema";
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
    id: string;
    name: string;
    perConnection: boolean;
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
  canvas: (Canvas & { ownerId: string; ownerName: string }) | null;
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
    { pairingCode: code },
    { signal },
  );
  if (!result.playerSession) {
    throw new PlayerRequestError("That pairing code is not active.", 404);
  }
  return normalizePlayerSession(result.playerSession);
}
function realtimeUrl(): string {
  const url = new URL("/api/realtime", API_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
function realtimeAuthUrl(pairingCode: string): string {
  return `${API_BASE_URL}/api/realtime/auth?code=${encodeURIComponent(pairingCode)}`;
}

type PlayerRealtimeSubscriber = RealtimeSubscriber & { close(): void };

type PlayerState =
  | { status: "idle" }
  | { status: "loading"; session: PlayerSession | null }
  | { status: "ready"; session: PlayerSession }
  | { status: "error"; message: string; notFound: boolean };

export function usePlayerSession(code: string) {
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
  // The subscription is created after the GraphQL snapshot resolves and is
  // closed explicitly below; React Doctor cannot follow that nested ownership.
  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    const controller = new AbortController();
    let subscription: RealtimeSubscription | null = null;
    let subscriber: PlayerRealtimeSubscriber | null = null;
    let currentDeviceId: string | null = null;
    let closed = false;

    const clearRealtime = () => {
      subscription?.close();
      subscription = null;
      subscriber?.close();
      subscriber = null;
    };

    const attach = (session: PlayerSession) => {
      if (closed) return;
      if (session.device.id === currentDeviceId && subscriber) return;

      clearRealtime();
      currentDeviceId = session.device.id;
      subscriber = USE_REALTIME_SOCKET
        ? new WebSocketRealtimeSubscriber(realtimeUrl(), playerChannel(session.device.id))
        : new AblyRealtimeSubscriber(
            realtimeAuthUrl(normalizedCode),
            playerChannel(session.device.id),
          );
      subscription = subscriber.subscribe(() => {
        void refresh(false);
      });
    };

    const refresh = async (showLoading: boolean) => {
      const session = await load(controller.signal, showLoading);
      if (session) attach(session);
    };

    void refresh(true);
    return () => {
      closed = true;
      controller.abort();
      subscription?.close();
      subscriber?.close();
    };
  }, [load, normalizedCode]);

  return state;
}

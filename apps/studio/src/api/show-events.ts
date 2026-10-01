// Listens on a Show's realtime channel (issue #467). The API announces there
// that a Device is waiting for the Show to start, and that a Run started or
// ended. Each of those is also a fact about the active Run, so every event
// refreshes it: a window learns the Show went live from another window or
// another machine instead of trusting what it last fetched.
import type { ShowId } from "@mechane/domain/id";
import { GetShowRealtimeQuery, graphqlRequest } from "@mechane/graphql-schema";
import { readShowChannelEvent, showChannel, type ShowChannelEvent } from "@mechane/realtime";
import { AblyRealtimeSubscriber, WebSocketRealtimeSubscriber } from "@mechane/realtime/browser";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";

import { GRAPHQL_ENDPOINT, resolveApiUrl } from "./client";
import { activeRunQueryKey } from "./runs";

// Development runs the API's own WebSocket adapter; production uses Ably
// (ADR-0003). Same rule as the Player's `shouldUseRealtimeSocket`.
const USE_REALTIME_SOCKET = !import.meta.env.PROD || import.meta.env.VITE_DEV_PROXY === "true";

export type ReceivedShowEvent = {
  event: ShowChannelEvent;
  /** When the API published it, by the API's clock. */
  publishedAt: Date;
};

export function useShowEvents(
  showId: ShowId | null,
  onEvent: (received: ReceivedShowEvent) => void,
): void {
  const queryClient = useQueryClient();
  const handleEvent = useEffectEvent(onEvent);

  useEffect(() => {
    if (showId === null) return;
    // Both subscribers ask again whenever the grant they hold has lapsed. A
    // failed request leaves them disconnected until the next attempt, which
    // costs this window its prompts, not its editing.
    const grant = async () => {
      try {
        const data = await graphqlRequest(GRAPHQL_ENDPOINT, GetShowRealtimeQuery, { showId });
        return data.showRealtime.grant;
      } catch {
        return null;
      }
    };
    const subscriber = USE_REALTIME_SOCKET
      ? new WebSocketRealtimeSubscriber(
          resolveApiUrl("/api/realtime").replace(/^http/, "ws"),
          grant,
        )
      : new AblyRealtimeSubscriber(resolveApiUrl("/api/realtime/auth"), showChannel(showId), grant);
    const subscription = subscriber.subscribe((message) => {
      const event = readShowChannelEvent(message);
      if (!event) return;
      void queryClient.invalidateQueries({ queryKey: activeRunQueryKey(showId) });
      handleEvent({ event, publishedAt: new Date(message.publishedAt) });
    });
    return () => {
      subscription.close();
      subscriber.close();
    };
  }, [queryClient, showId]);
}

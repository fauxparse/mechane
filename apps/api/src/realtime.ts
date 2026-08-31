import { AblyRealtimeProvider } from "@mechane/realtime/ably";
import { LocalRealtimeProvider, LocalRealtimeServer } from "@mechane/realtime/local";
import type { RealtimeProvider } from "@mechane/realtime";
import { playerChannel } from "@mechane/realtime";

import { verifyRealtimeGrant } from "./realtime-grants";

const providerName =
  process.env.REALTIME_PROVIDER ?? (process.env.NODE_ENV === "production" ? "ably" : "websocket");

export const realtimeProvider: RealtimeProvider =
  providerName === "ably"
    ? new AblyRealtimeProvider({
        key:
          process.env.ABLY_API_KEY ??
          (() => {
            throw new Error("ABLY_API_KEY is required when REALTIME_PROVIDER=ably.");
          })(),
      })
    : new LocalRealtimeProvider();

export const localRealtimeServer =
  providerName === "websocket"
    ? new LocalRealtimeServer(realtimeProvider, {
        authorize: (_request, grant) => {
          const payload = verifyRealtimeGrant(grant);
          return payload ? playerChannel(payload.deviceId) : null;
        },
      })
    : null;

import { randomUUID } from "node:crypto";

import type {
  RealtimeChannel,
  RealtimeMessage,
  RealtimeProvider,
  RealtimeSubscription,
} from "@mechane/realtime";

import { startPlayerInvalidationWorker } from "./db/player-invalidation-outbox";

const apiUrl = process.env.REALTIME_API_URL ?? "http://localhost:4000";
const configuredWorkerSecret = process.env.REALTIME_WORKER_SECRET ?? process.env.BETTER_AUTH_SECRET;
if (!configuredWorkerSecret) {
  throw new Error("BETTER_AUTH_SECRET is required for the realtime worker.");
}
const workerSecret = configuredWorkerSecret;

class HttpRealtimeProvider implements RealtimeProvider {
  channel(name: string): RealtimeChannel {
    return {
      publish: async <T>(type: string, payload: T): Promise<RealtimeMessage<T>> => {
        const response = await fetch(`${apiUrl}/api/realtime/internal/publish`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Realtime-Worker-Secret": workerSecret,
          },
          body: JSON.stringify({ channel: name, type, payload }),
        });
        if (!response.ok) throw new Error(`Realtime API returned HTTP ${response.status}.`);
        return {
          id: randomUUID(),
          sequence: 0,
          type,
          payload,
          publishedAt: new Date().toISOString(),
        };
      },
      subscribe: (): RealtimeSubscription => ({ close: () => undefined }),
    };
  }
}

const worker = startPlayerInvalidationWorker(250, new HttpRealtimeProvider());
const stop = () => worker.stop();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

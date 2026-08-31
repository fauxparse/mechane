import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

import type {
  RealtimeChannel,
  RealtimeChannelName,
  RealtimeMessage,
  RealtimeMessageHandler,
  RealtimeProvider,
  RealtimeSubscribeOptions,
  RealtimeSubscription,
} from "./index";

const MAX_HISTORY = 1_000;

class LocalChannel implements RealtimeChannel {
  private sequence = 0;
  private readonly history: RealtimeMessage[] = [];
  private readonly subscribers = new Set<RealtimeMessageHandler>();

  async publish<T>(type: string, payload: T): Promise<RealtimeMessage<T>> {
    const message: RealtimeMessage<T> = {
      id: randomUUID(),
      sequence: ++this.sequence,
      type,
      payload,
      publishedAt: new Date().toISOString(),
    };
    this.history.push(message);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    for (const subscriber of this.subscribers) subscriber(message);
    return message;
  }

  subscribe(
    handler: RealtimeMessageHandler,
    options: RealtimeSubscribeOptions = {},
  ): RealtimeSubscription {
    const after = options.after ?? 0;
    const oldest = this.history[0]?.sequence ?? this.sequence + 1;
    if (after > 0 && after < oldest - 1) {
      handler({
        id: randomUUID(),
        sequence: this.sequence,
        type: "snapshot-required",
        payload: { after, oldestSequence: oldest },
        publishedAt: new Date().toISOString(),
      });
    } else {
      for (const message of this.history) {
        if (message.sequence > after) handler(message);
      }
    }
    this.subscribers.add(handler);
    return { close: () => this.subscribers.delete(handler) };
  }
}

export class LocalRealtimeProvider implements RealtimeProvider {
  private readonly channels = new Map<RealtimeChannelName, LocalChannel>();

  channel(name: RealtimeChannelName): RealtimeChannel {
    let channel = this.channels.get(name);
    if (!channel) {
      channel = new LocalChannel();
      this.channels.set(name, channel);
    }
    return channel;
  }
}

interface SubscribeCommand {
  type: "subscribe";
  grant: string;
  after?: number;
}

function isSubscribeCommand(value: unknown): value is SubscribeCommand {
  if (value === null || typeof value !== "object") return false;
  const command = value as Record<string, unknown>;
  return command.type === "subscribe" && typeof command.grant === "string";
}

export interface LocalRealtimeServerOptions {
  authorize?: (
    request: IncomingMessage,
    grant: string,
  ) => RealtimeChannelName | null | Promise<RealtimeChannelName | null>;
}

/** Bridges the local provider to WebSocket clients in the API dev process. */
export class LocalRealtimeServer {
  private readonly server: WebSocketServer;
  private readonly subscriptions = new WeakMap<WebSocket, RealtimeSubscription[]>();

  constructor(
    private readonly provider: RealtimeProvider,
    private readonly options: LocalRealtimeServerOptions = {},
  ) {
    this.server = new WebSocketServer({ noServer: true });
    this.server.on("connection", (socket, request) => this.handleConnection(socket, request));
  }

  handleUpgrade(request: IncomingMessage, socket: NodeJS.WritableStream, head: Buffer): void {
    this.server.handleUpgrade(request, socket as never, head, (client) => {
      this.server.emit("connection", client, request);
    });
  }

  close(): Promise<void> {
    for (const client of this.server.clients) client.close();
    return new Promise((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const subscriptions: RealtimeSubscription[] = [];
    this.subscriptions.set(socket, subscriptions);
    socket.on("message", async (raw) => {
      let value: unknown;
      try {
        value = JSON.parse(raw.toString());
      } catch {
        socket.send(JSON.stringify({ type: "error", payload: { reason: "Invalid JSON." } }));
        return;
      }
      if (!isSubscribeCommand(value)) {
        socket.send(
          JSON.stringify({ type: "error", payload: { reason: "Invalid subscribe command." } }),
        );
        return;
      }
      const channel = this.options.authorize
        ? await this.options.authorize(request, value.grant)
        : null;
      if (!channel) {
        socket.send(
          JSON.stringify({ type: "error", payload: { reason: "Unauthorized channel." } }),
        );
        return;
      }
      const subscription = this.provider.channel(channel).subscribe(
        (message) => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
        },
        { after: value.after },
      );
      subscriptions.push(subscription);
    });
    socket.on("close", () => {
      for (const subscription of subscriptions) subscription.close();
      subscriptions.length = 0;
    });
  }
}

import * as Ably from "ably";
import type {
  RealtimeMessage,
  RealtimeMessageHandler,
  RealtimeSubscriber,
  RealtimeSubscribeOptions,
  RealtimeSubscription,
} from "./index";

interface BrowserWebSocket extends WebSocket {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}
type WebSocketConstructor = new (url: string) => BrowserWebSocket;

type RealtimeGrantProvider = () => string | null | Promise<string | null>;

/** Browser subscriber for the local WebSocket adapter or a proxy. */
export class WebSocketRealtimeSubscriber implements RealtimeSubscriber {
  private readonly handlers = new Set<RealtimeMessageHandler>();
  private socket: BrowserWebSocket;
  private lastSequence = 0;
  private closed = false;

  constructor(
    private readonly url: string,
    private readonly grantProvider: RealtimeGrantProvider,
    private readonly WebSocketImpl: WebSocketConstructor = WebSocket,
  ) {
    this.socket = this.connect();
  }

  subscribe(
    handler: RealtimeMessageHandler,
    options: RealtimeSubscribeOptions = {},
  ): RealtimeSubscription {
    if (options.after !== undefined) this.lastSequence = options.after;
    const wasEmpty = this.handlers.size === 0;
    this.handlers.add(handler);
    if (wasEmpty && this.socket.readyState === WebSocket.OPEN) this.subscribeOnSocket();
    return {
      close: () => {
        this.handlers.delete(handler);
        if (this.handlers.size === 0) this.close();
      },
    };
  }

  close(): void {
    this.closed = true;
    this.socket.close();
    this.handlers.clear();
  }

  private async subscribeOnSocket(): Promise<void> {
    if (this.handlers.size === 0 || this.closed) return;
    const grant = await this.grantProvider();
    if (
      !grant ||
      this.handlers.size === 0 ||
      this.closed ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    this.socket.send(
      JSON.stringify({
        type: "subscribe",
        grant,
        ...(this.lastSequence > 0 ? { after: this.lastSequence } : {}),
      }),
    );
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let message: RealtimeMessage;
    try {
      message = JSON.parse(raw) as RealtimeMessage;
    } catch {
      return;
    }
    if (typeof message.sequence === "number" && message.sequence > this.lastSequence) {
      this.lastSequence = message.sequence;
    }
    for (const handler of this.handlers) handler(message);
  }

  private connect(): BrowserWebSocket {
    const socket = new this.WebSocketImpl(this.url);
    socket.onopen = () => void this.subscribeOnSocket();
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onclose = () => {
      if (!this.closed) {
        setTimeout(() => {
          if (!this.closed) this.socket = this.connect();
        }, 250);
      }
    };
    return socket;
  }
}

/** Production subscriber using Ably's browser client and token auth. */
export class AblyRealtimeSubscriber implements RealtimeSubscriber {
  private readonly client: Ably.Realtime;
  private readonly channel: Ably.RealtimeChannel;

  constructor(
    private readonly authUrl: string,
    channelName: string,
    private readonly grantProvider: RealtimeGrantProvider,
  ) {
    this.client = new Ably.Realtime({
      authCallback: (_params, callback) => {
        void this.requestToken(callback);
      },
    });
    this.channel = this.client.channels.get(channelName);
  }

  private async requestToken(
    callback: (
      error: Ably.ErrorInfo | string | null,
      tokenRequestOrDetails: Ably.TokenDetails | Ably.TokenRequest | string | null,
    ) => void,
  ): Promise<void> {
    try {
      const grant = await this.grantProvider();
      if (!grant) {
        callback("Realtime authorization expired.", null);
        return;
      }
      const url = new URL(this.authUrl);
      url.searchParams.set("grant", grant);
      const response = await fetch(url);
      if (!response.ok) {
        callback("Realtime authorization failed.", null);
        return;
      }
      callback(null, await response.json());
    } catch {
      callback("Realtime authorization failed.", null);
    }
  }

  subscribe(
    handler: RealtimeMessageHandler,
    _options?: RealtimeSubscribeOptions,
  ): RealtimeSubscription {
    const listener = (message: Ably.Message) => handler(message.data as RealtimeMessage);
    this.channel.subscribe(listener);
    return {
      close: () => this.channel.unsubscribe(listener),
    };
  }

  close(): void {
    this.client.close();
  }
}

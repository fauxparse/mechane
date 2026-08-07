import type {
  RealtimeChannelName,
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

/** Browser subscriber for either the local WebSocket adapter or a proxy. */
export class WebSocketRealtimeSubscriber implements RealtimeSubscriber {
  private readonly handlers = new Set<RealtimeMessageHandler>();
  private socket: BrowserWebSocket;
  private lastSequence = 0;
  private closed = false;

  constructor(
    private readonly url: string,
    private readonly channel: RealtimeChannelName,
    private readonly WebSocketImpl: WebSocketConstructor = WebSocket,
  ) {
    this.socket = this.connect();
  }

  subscribe(handler: RealtimeMessageHandler, options: RealtimeSubscribeOptions = {}): RealtimeSubscription {
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

  private subscribeOnSocket(): void {
    if (this.handlers.size === 0) return;
    this.socket.send(JSON.stringify({
      type: "subscribe",
      channel: this.channel,
      ...(this.lastSequence > 0 ? { after: this.lastSequence } : {}),
    }));
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
    socket.onopen = () => this.subscribeOnSocket();
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

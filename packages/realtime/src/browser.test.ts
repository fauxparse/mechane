import { afterEach, describe, expect, it, vi } from "vitest";

import { WebSocketRealtimeSubscriber } from "./browser";

type FakeSocket = {
  readyState: number;
  sent: string[];
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  open(): void;
  receive(value: string): void;
  close(): void;
};

class TestCloseEvent extends Event {
  readonly code = 1_000;
  readonly reason = "";
  readonly wasClean = true;
}

class FakeWebSocket implements FakeSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static readonly sockets: FakeWebSocket[] = [];
  readonly sent: string[] = [];
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.sockets.push(this);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  send(data: string): void {
    this.sent.push(data);
  }
  receive(value: string): void {
    this.onmessage?.(new MessageEvent("message", { data: value }));
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new TestCloseEvent("close"));
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeWebSocket.sockets.length = 0;
});

describe("WebSocketRealtimeSubscriber", () => {
  it("renews its grant and resumes from the last sequence after reconnect", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    let grantNumber = 0;
    const received: string[] = [];
    const subscriber = new WebSocketRealtimeSubscriber(
      "ws://localhost/api/realtime",
      () => `grant-${++grantNumber}`,
      FakeWebSocket,
    );
    subscriber.subscribe((message) => received.push(message.type));

    const first = FakeWebSocket.sockets[0];
    if (!first) throw new Error("Initial socket was not created.");
    first.open();
    await vi.runOnlyPendingTimersAsync();
    expect(JSON.parse(first.sent[0] ?? "{}")).toMatchObject({
      type: "subscribe",
      grant: "grant-1",
    });

    first.receive(
      JSON.stringify({
        id: "message-1",
        sequence: 4,
        type: "player.updated",
        payload: null,
        publishedAt: "2026-08-31T00:00:00.000Z",
      }),
    );
    first.close();
    await vi.advanceTimersByTimeAsync(250);

    const second = FakeWebSocket.sockets[1];
    if (!second) throw new Error("Reconnect socket was not created.");
    second.open();
    await vi.runOnlyPendingTimersAsync();
    expect(JSON.parse(second.sent[0] ?? "{}")).toMatchObject({
      type: "subscribe",
      grant: "grant-2",
      after: 4,
    });
    expect(received).toEqual(["player.updated"]);
    subscriber.close();
  });
});

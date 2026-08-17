import * as Ably from "ably";
import { randomUUID } from "node:crypto";

import type {
  RealtimeChannel,
  RealtimeChannelName,
  RealtimeMessage,
  RealtimeMessageHandler,
  RealtimeProvider,
  RealtimeSubscribeOptions,
  RealtimeSubscription,
} from "./index";

export interface AblyRealtimeOptions {
  key: string;
}

class AblyChannel implements RealtimeChannel {
  constructor(private readonly channel: Ably.RealtimeChannel) {}

  async publish<T>(type: string, payload: T): Promise<RealtimeMessage<T>> {
    const message: RealtimeMessage<T> = {
      id: randomUUID(),
      sequence: 0,
      type,
      payload,
      publishedAt: new Date().toISOString(),
    };
    await this.channel.publish(type, message);
    return message;
  }

  subscribe(
    handler: RealtimeMessageHandler,
    _options?: RealtimeSubscribeOptions,
  ): RealtimeSubscription {
    const listener = (message: Ably.Message) => handler(message.data as RealtimeMessage);
    this.channel.subscribe(listener);
    return { close: () => this.channel.unsubscribe(listener) };
  }
}

/** Production adapter. Ably owns connection continuity and catch-up. */
export class AblyRealtimeProvider implements RealtimeProvider {
  private readonly client: Ably.Realtime;

  constructor(options: AblyRealtimeOptions) {
    this.client = new Ably.Realtime({ key: options.key });
  }

  channel(name: RealtimeChannelName): RealtimeChannel {
    return new AblyChannel(this.client.channels.get(name));
  }
}

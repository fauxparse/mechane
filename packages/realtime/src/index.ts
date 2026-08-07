export const RUN_CHANNEL_PREFIX = "run:";

export type RealtimeChannelName = `${typeof RUN_CHANNEL_PREFIX}${string}`;

export interface RealtimeMessage<T = unknown> {
  id: string;
  sequence: number;
  type: string;
  payload: T;
  publishedAt: string;
}

export interface RealtimeSubscribeOptions {
  after?: number;
}

export interface RealtimeSubscription {
  close(): void;
}

export type RealtimeMessageHandler = (message: RealtimeMessage) => void;

export interface RealtimeChannel {
  publish<T>(type: string, payload: T): Promise<RealtimeMessage<T>>;
  subscribe(handler: RealtimeMessageHandler, options?: RealtimeSubscribeOptions): RealtimeSubscription;
}

export interface RealtimeProvider {
  channel(name: RealtimeChannelName): RealtimeChannel;
}

export function runChannel(runId: string): RealtimeChannelName {
  return `${RUN_CHANNEL_PREFIX}${runId}`;
}

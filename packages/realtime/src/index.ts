export const RUN_CHANNEL_PREFIX = "run:";
export const PLAYER_CHANNEL_PREFIX = "player:";

function opaqueChannelSuffix(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}
export type RealtimeChannelName =
  | `${typeof RUN_CHANNEL_PREFIX}${string}`
  | `${typeof PLAYER_CHANNEL_PREFIX}${string}`;

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
  subscribe(
    handler: RealtimeMessageHandler,
    options?: RealtimeSubscribeOptions,
  ): RealtimeSubscription;
}

export interface RealtimeSubscriber {
  subscribe(
    handler: RealtimeMessageHandler,
    options?: RealtimeSubscribeOptions,
  ): RealtimeSubscription;
}

export interface RealtimeProvider {
  channel(name: RealtimeChannelName): RealtimeChannel;
}

export function runChannel(runId: string): RealtimeChannelName {
  return `${RUN_CHANNEL_PREFIX}${runId}`;
}
export function playerChannel(deviceId: string): RealtimeChannelName {
  return `${PLAYER_CHANNEL_PREFIX}${opaqueChannelSuffix(deviceId)}`;
}

export function isRealtimeChannelName(value: string): value is RealtimeChannelName {
  return (
    (value.startsWith(RUN_CHANNEL_PREFIX) || value.startsWith(PLAYER_CHANNEL_PREFIX)) &&
    value.length > value.indexOf(":") + 1
  );
}

export const RUN_CHANNEL_PREFIX = "run:";
export const PLAYER_CHANNEL_PREFIX = "player:";
export const SHOW_CHANNEL_PREFIX = "show:";

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
  | `${typeof PLAYER_CHANNEL_PREFIX}${string}`
  | `${typeof SHOW_CHANNEL_PREFIX}${string}`;

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
/** The channel Studio windows editing a Show listen on (issue #467). */
export function showChannel(showId: string): RealtimeChannelName {
  return `${SHOW_CHANNEL_PREFIX}${opaqueChannelSuffix(showId)}`;
}

export function isRealtimeChannelName(value: string): value is RealtimeChannelName {
  return (
    (value.startsWith(RUN_CHANNEL_PREFIX) ||
      value.startsWith(PLAYER_CHANNEL_PREFIX) ||
      value.startsWith(SHOW_CHANNEL_PREFIX)) &&
    value.length > value.indexOf(":") + 1
  );
}

/**
 * What a Show's channel carries to the Studio windows editing it. A Device
 * that connected while the Show had no Run is `device.waiting`; the Run
 * lifecycle events let every window, not only the one that pressed the
 * button, learn the Show is live or stopped.
 */
export type ShowChannelEvent =
  | { type: "device.waiting"; payload: { deviceId: string; deviceName: string } }
  | { type: "run.started"; payload: { runId: string } }
  | { type: "run.ended"; payload: { runId: string } };

function hasStringFields<K extends string>(
  value: unknown,
  keys: readonly K[],
): value is Record<K, string> {
  if (value === null || typeof value !== "object") return false;
  return keys.every((key) => key in value && typeof Reflect.get(value, key) === "string");
}

/** Reads a Show channel message, or null for anything this version does not know. */
export function readShowChannelEvent(message: RealtimeMessage): ShowChannelEvent | null {
  switch (message.type) {
    case "device.waiting":
      return hasStringFields(message.payload, ["deviceId", "deviceName"])
        ? {
            type: message.type,
            payload: {
              deviceId: message.payload.deviceId,
              deviceName: message.payload.deviceName,
            },
          }
        : null;
    case "run.started":
    case "run.ended":
      return hasStringFields(message.payload, ["runId"])
        ? { type: message.type, payload: { runId: message.payload.runId } }
        : null;
    default:
      return null;
  }
}

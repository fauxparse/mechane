import { createHmac, timingSafeEqual } from "node:crypto";

import { playerChannel, showChannel, type RealtimeChannelName } from "@mechane/realtime";

const GRANT_TTL_MS = 60_000;

/**
 * Who a grant lets subscribe: a paired Player to its Device's channel, or a
 * Studio window to the channel of a Show its user owns. Ownership is checked
 * where the grant is issued; the grant itself only names the channel.
 */
export type RealtimeGrantSubject =
  | { kind: "player"; deviceId: string }
  | { kind: "show"; showId: string };

export type RealtimeGrantPayload = RealtimeGrantSubject & {
  channel: RealtimeChannelName;
  expiresAt: number;
};

function channelForSubject(subject: RealtimeGrantSubject): RealtimeChannelName {
  switch (subject.kind) {
    case "player":
      return playerChannel(subject.deviceId);
    case "show":
      return showChannel(subject.showId);
    default: {
      const _exhaustive: never = subject;
      return _exhaustive;
    }
  }
}

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("BETTER_AUTH_SECRET is required for realtime grants.");
  return value;
}

function encode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issueRealtimeGrant(
  subject: RealtimeGrantSubject,
  now = Date.now(),
): RealtimeGrantPayload & { token: string } {
  const payload: RealtimeGrantPayload = {
    ...subject,
    channel: channelForSubject(subject),
    expiresAt: now + GRANT_TTL_MS,
  };
  const encoded = encode(JSON.stringify(payload));
  return { ...payload, token: `${encoded}.${sign(encoded)}` };
}

function readSubject(payload: object): RealtimeGrantSubject | null {
  if (!("kind" in payload)) return null;
  if (payload.kind === "player" && "deviceId" in payload && typeof payload.deviceId === "string") {
    return { kind: "player", deviceId: payload.deviceId };
  }
  if (payload.kind === "show" && "showId" in payload && typeof payload.showId === "string") {
    return { kind: "show", showId: payload.showId };
  }
  return null;
}

export function verifyRealtimeGrant(token: string, now = Date.now()): RealtimeGrantPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    payload === null ||
    typeof payload !== "object" ||
    !("channel" in payload) ||
    !("expiresAt" in payload) ||
    typeof payload.channel !== "string" ||
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt <= now
  ) {
    return null;
  }
  const subject = readSubject(payload);
  if (!subject) return null;
  const channel = channelForSubject(subject);
  if (payload.channel !== channel) return null;
  return { ...subject, channel, expiresAt: payload.expiresAt };
}

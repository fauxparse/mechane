import { createHmac, timingSafeEqual } from "node:crypto";

import { playerChannel } from "@mechane/realtime";

const GRANT_TTL_MS = 60_000;

type RealtimeGrantPayload = {
  deviceId: string;
  channel: string;
  expiresAt: number;
};

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
  deviceId: string,
  now = Date.now(),
): RealtimeGrantPayload & { token: string } {
  const payload: RealtimeGrantPayload = {
    deviceId,
    channel: playerChannel(deviceId),
    expiresAt: now + GRANT_TTL_MS,
  };
  const encoded = encode(JSON.stringify(payload));
  return { ...payload, token: `${encoded}.${sign(encoded)}` };
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
    !("deviceId" in payload) ||
    !("channel" in payload) ||
    !("expiresAt" in payload) ||
    typeof payload.deviceId !== "string" ||
    typeof payload.channel !== "string" ||
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt <= now ||
    payload.channel !== playerChannel(payload.deviceId)
  ) {
    return null;
  }
  return {
    deviceId: payload.deviceId,
    channel: payload.channel,
    expiresAt: payload.expiresAt,
  };
}

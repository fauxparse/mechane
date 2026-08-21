import type { IncomingMessage, ServerResponse } from "node:http";

import { createAblyTokenRequest } from "@mechane/realtime/ably";
import { playerChannel } from "@mechane/realtime";

import { applyCorsHeaders } from "./lib/cors";
import { readPlayerSession } from "./player";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

/** Issues a narrowly-scoped Ably token after validating the pairing code. */
export async function handleRealtimeAuthRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/api/realtime/auth") return false;

  const isPreflight = applyCorsHeaders(res, req.headers.origin, req.method);
  if (isPreflight) {
    res.statusCode = 204;
    res.end();
    return true;
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    sendJson(res, 405, { error: "Method not allowed." });
    return true;
  }

  const session = await readPlayerSession(url.searchParams.get("code") ?? "");
  if (!session) {
    sendJson(res, 401, { error: "Invalid pairing code." });
    return true;
  }

  const key = process.env.ABLY_API_KEY;
  if (!key) {
    sendJson(res, 503, { error: "Realtime service is not configured." });
    return true;
  }

  const tokenRequest = await createAblyTokenRequest({
    key,
    clientId: `player:${session.device.id}`,
    capability: JSON.stringify({ [playerChannel(session.device.id)]: ["subscribe"] }),
  });
  sendJson(res, 200, tokenRequest);
  return true;
}

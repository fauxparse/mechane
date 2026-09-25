// Plain Node http server for local development (`pnpm dev`).
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { isRealtimeChannelName } from "@mechane/realtime";

import { httpHandler } from "./http-handler";
import { localRealtimeServer, realtimeProvider } from "./realtime";

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function workerSecret(): string | null {
  return process.env.REALTIME_WORKER_SECRET ?? process.env.BETTER_AUTH_SECRET ?? null;
}

async function handleInternalRealtimePublish(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/api/realtime/internal/publish") return false;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.statusCode = 405;
    res.end();
    return true;
  }
  const configuredSecret = workerSecret();
  const providedSecret = req.headers["x-realtime-worker-secret"];
  if (!configuredSecret || providedSecret !== configuredSecret) {
    res.statusCode = 401;
    res.end();
    return true;
  }
  let body: unknown;
  try {
    body = JSON.parse((await readBody(req)).toString("utf8"));
  } catch {
    res.statusCode = 400;
    res.end();
    return true;
  }
  if (
    body === null ||
    typeof body !== "object" ||
    !("channel" in body) ||
    !("type" in body) ||
    typeof body.channel !== "string" ||
    !isRealtimeChannelName(body.channel) ||
    typeof body.type !== "string"
  ) {
    res.statusCode = 400;
    res.end();
    return true;
  }
  await realtimeProvider
    .channel(body.channel)
    .publish(body.type, "payload" in body ? body.payload : null);
  res.statusCode = 204;
  res.end();
  return true;
}

const server = createServer(async (req, res) => {
  if (await handleInternalRealtimePublish(req, res)) return;
  await httpHandler(req, res);
});

server.on("upgrade", (request, socket, head) => {
  if (new URL(request.url ?? "/", "http://localhost").pathname !== "/api/realtime") {
    socket.destroy();
    return;
  }
  if (!localRealtimeServer) {
    socket.destroy();
    return;
  }
  localRealtimeServer.handleUpgrade(request, socket, head);
});

const port = Number(process.env.PORT ?? 4000);
server.listen(port, "0.0.0.0", () => {
  console.log(`@mechane/api listening on http://localhost:${port}`);
  console.log(`GraphQL: http://localhost:${port}/api/graphql`);
  console.log(`Auth:    http://localhost:${port}/api/auth`);
  if (localRealtimeServer) console.log(`Realtime: ws://localhost:${port}/api/realtime`);
});

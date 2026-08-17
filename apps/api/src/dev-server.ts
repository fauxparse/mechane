// Plain Node http server for local development (`pnpm dev`). Vercel's own
// dev server (`vercel dev`) can also run this app directly against
// apps/api/api/*, but this avoids requiring a Vercel login for day-to-day
// work against local Postgres.
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { and, eq } from "drizzle-orm";
import { toNodeHandler } from "better-auth/node";

import { auth } from "./auth";
import { db } from "./db/client";
import { imageAssets } from "./db/schema";
import { blobStore } from "./storage/blob-store";
import { yoga } from "./graphql/server";
import { applyCorsHeaders } from "./lib/cors";
import { localRealtimeServer } from "./realtime";

const authHandler = toNodeHandler(auth);

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function handleBinaryRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api") return false;
  if (parts[1] === "uploads" && parts[2] && req.method === "PUT") {
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session) {
      res.statusCode = 401;
      res.end("Authentication required.");
      return true;
    }
    const bytes = await readBody(req);
    await blobStore.putUpload(parts[2], bytes);
    res.statusCode = 204;
    res.end();
    return true;
  }
  if (parts[1] === "images" && parts[2] && parts[3] && req.method === "GET") {
    const [asset] = await db
      .select()
      .from(imageAssets)
      .where(and(eq(imageAssets.id, parts[2]), eq(imageAssets.revision, parts[3]), eq(imageAssets.state, "active")));
    if (!asset) {
      res.statusCode = 404;
      res.end();
      return true;
    }
    const bytes = await blobStore.readBlob(asset.blobDigest);
    if (!bytes) {
      res.statusCode = 404;
      res.end();
      return true;
    }
    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.statusCode = 200;
    res.end(bytes);
    return true;
  }
  return false;
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (await handleBinaryRoute(req, res)) return;
  // graphql-yoga applies its own CORS headers (configured in
  // graphql/server.ts) for /api/graphql; Better Auth's handler doesn't, so
  // it needs the same treatment applied manually here.
  if (req.url?.startsWith("/api/auth")) {
    const isPreflight = applyCorsHeaders(res, req.headers.origin, req.method);
    if (isPreflight) {
      res.statusCode = 204;
      res.end();
      return;
    }
    authHandler(req, res);
    return;
  }
  yoga(req, res);
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
server.listen(port, () => {
  console.log(`@mechane/api listening on http://localhost:${port}`);
  console.log(`GraphQL: http://localhost:${port}/api/graphql`);
  console.log(`Auth:    http://localhost:${port}/api/auth`);
  if (localRealtimeServer) console.log(`Realtime: ws://localhost:${port}/api/realtime`);
});

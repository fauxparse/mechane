// Plain Node http server for local development (`pnpm dev`). Vercel's own
// dev server (`vercel dev`) can also run this app directly against
// apps/api/api/*, but this avoids requiring a Vercel login for day-to-day
// work against local Postgres.
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { toNodeHandler } from "better-auth/node";

import { auth } from "./auth";
import { yoga } from "./graphql/server";
import { applyCorsHeaders } from "./lib/cors";
import { localRealtimeServer } from "./realtime";

const authHandler = toNodeHandler(auth);

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
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

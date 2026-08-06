// Vercel serverless function entry point for Better Auth's /api/auth/*
// routes — mirrors ../graphql.ts's pattern. The `[...all]` filename is
// Vercel's catch-all-route convention (this single function handles every
// path under /api/auth/, e.g. /api/auth/sign-in/email). Unlike graphql-yoga,
// Better Auth's handler doesn't add CORS headers itself, so this wraps it
// the same way ../../src/dev-server.ts does for local dev (see
// ../../src/lib/cors.ts).
import { toNodeHandler } from "better-auth/node";
import type { IncomingMessage, ServerResponse } from "node:http";

import { auth } from "../../src/auth";
import { applyCorsHeaders } from "../../src/lib/cors";

const authHandler = toNodeHandler(auth);

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const isPreflight = applyCorsHeaders(res, req.headers.origin, req.method);
  if (isPreflight) {
    res.statusCode = 204;
    res.end();
    return;
  }
  return authHandler(req, res);
}

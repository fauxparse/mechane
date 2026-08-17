import type { IncomingMessage, ServerResponse } from "node:http";

import { eq } from "drizzle-orm";

import { DEFAULT_IMAGE_UPLOAD_POLICY } from "@mechane/domain";

import { auth } from "../../src/auth";
import { db } from "../../src/db/client";
import { blobUploadSessions } from "../../src/db/schema";
import { applyCorsHeaders } from "../../src/lib/cors";
import { blobStore } from "../../src/storage/blob-store";

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > maxBytes) throw new Error("Upload exceeds the source byte limit.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, length);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const isPreflight = applyCorsHeaders(res, req.headers.origin, req.method);
  if (isPreflight) {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "PUT") {
    res.statusCode = 405;
    res.setHeader("Allow", "OPTIONS, PUT");
    res.end();
    return;
  }
  const authSession = await auth.api.getSession({
    headers: new Headers(req.headers as Record<string, string>),
  });
  if (!authSession) {
    res.statusCode = 401;
    res.end("Authentication required.");
    return;
  }

  const parts = new URL(req.url ?? "/", "http://localhost").pathname.split("/").filter(Boolean);
  const sessionId = parts.at(-1);
  if (!sessionId || parts.at(-2) !== "uploads") {
    res.statusCode = 404;
    res.end();
    return;
  }

  const [session] = await db
    .select()
    .from(blobUploadSessions)
    .where(eq(blobUploadSessions.id, sessionId));
  if (!session) {
    res.statusCode = 404;
    res.end();
    return;
  }
  if (session.expiresAt <= new Date()) {
    res.statusCode = 410;
    res.end();
    return;
  }
  if (req.headers["content-type"] !== session.declaredMimeType) {
    res.statusCode = 415;
    res.end();
    return;
  }
  const declaredLength = Number(req.headers["content-length"]);
  if (!Number.isInteger(declaredLength) || declaredLength !== session.byteLength) {
    res.statusCode = 400;
    res.end();
    return;
  }

  try {
    const bytes = await readBody(req, DEFAULT_IMAGE_UPLOAD_POLICY.maxSourceBytes);
    if (bytes.byteLength !== session.byteLength) {
      res.statusCode = 400;
      res.end();
      return;
    }
    await blobStore.putUpload(session.id, bytes);
    res.statusCode = 204;
    res.end();
  } catch {
    res.statusCode = 413;
    res.end();
  }
}

import type { IncomingMessage, ServerResponse } from "node:http";

import { and, eq } from "drizzle-orm";

import { applyCorsHeaders } from "../../src/lib/cors";
import { db } from "../../src/db/client";
import { imageAssets } from "../../src/db/schema";
import { blobStore } from "../../src/storage/blob-store";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const isPreflight = applyCorsHeaders(res, req.headers.origin, req.method);
  if (isPreflight) {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "OPTIONS, GET");
    res.end();
    return;
  }
  const parts = new URL(req.url ?? "/", "http://localhost").pathname.split("/").filter(Boolean);
  const assetId = parts.at(-2);
  const revision = parts.at(-1);
  if (!assetId || !revision) {
    res.statusCode = 404;
    res.end();
    return;
  }
  const [asset] = await db
    .select()
    .from(imageAssets)
    .where(
      and(
        eq(imageAssets.id, assetId),
        eq(imageAssets.revision, revision),
        eq(imageAssets.state, "active"),
      ),
    );
  if (!asset) {
    res.statusCode = 404;
    res.end();
    return;
  }
  const bytes = await blobStore.readBlob(asset.blobDigest);
  if (!bytes) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader("Content-Type", asset.mimeType);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.end(bytes);
}

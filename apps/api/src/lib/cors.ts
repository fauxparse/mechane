// apps/studio is served from a different origin than apps/api (even in
// local dev — Vite on :5173, this API on :4000), so both the GraphQL
// endpoint and Better Auth's routes need CORS headers that allow credentialed
// requests from it, or the browser drops the session cookie entirely. Kept
// as one shared allowlist so the GraphQL server (graphql-yoga's own `cors`
// option) and the plain-Node Better Auth handler (`toNodeHandler`, which
// doesn't add CORS headers itself) can't drift apart.
const configuredOrigin = process.env.APP_STUDIO_URL ?? "http://localhost:5173";

export const ALLOWED_ORIGINS = [configuredOrigin];

export function isAllowedOrigin(origin: string | undefined): origin is string {
  return origin !== undefined && ALLOWED_ORIGINS.includes(origin);
}

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization";

/**
 * Applies the standard credentialed-CORS headers to a Node response when
 * `origin` is on the allowlist, and reports whether the caller should treat
 * this as a handled CORS preflight (`OPTIONS`) request.
 */
export function applyCorsHeaders(
  res: { setHeader: (name: string, value: string) => void },
  origin: string | undefined,
  method: string | undefined,
): boolean {
  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    res.setHeader("Vary", "Origin");
  }
  return method === "OPTIONS";
}

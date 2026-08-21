// apps/studio and apps/player are served from different origins than
// apps/api (even in local dev — Vite runs on :5173 and :5174), so their
// browser requests need CORS headers. Studio also needs credentialed
// requests for its Better Auth session; Player only uses the pairing code.
// Keep both origins in one explicit allowlist so the handlers cannot drift.
const configuredStudioOrigin = process.env.APP_STUDIO_URL ?? "http://localhost:5173";
const configuredPlayerOrigins = [
  process.env.APP_PLAYER_URL ?? "https://show.mechane.dev",
  "http://localhost:5174",
];

export const ALLOWED_ORIGINS = [configuredStudioOrigin, ...configuredPlayerOrigins];
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

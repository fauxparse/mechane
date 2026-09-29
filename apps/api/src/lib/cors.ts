// apps/studio, apps/player and apps/site are served from different origins
// than apps/api (even in local dev — Vite runs on :5173, :5174 and :5175), so
// their browser requests need CORS headers. Studio needs credentialed
// requests for its Better Auth session; the holding page (apps/site) sends
// the same cookie to show signed-in visitors a dashboard link; Player only
// uses the pairing code. Keep the origins in one explicit allowlist so the
// handlers cannot drift.
//
// A Player page served from a Custom Domain is on an origin no allowlist can
// know, so the routes the Player calls answer split-horizon (ADR-0023): an
// allowed origin keeps the credentialed exact-origin echo, and any other
// origin gets `*` with no credentials header. `*` is safe only because it is
// uncredentialed: a browser refuses to expose the response of a credentialed
// request answered with `*`, so a foreign page can read what a pairing code
// already grants but can never ride a signed-in Studio session.
const configuredStudioOrigin = process.env.APP_STUDIO_URL ?? "http://localhost:5173";
const configuredPlayerOrigins = [
  process.env.APP_PLAYER_URL ?? "https://show.mechane.dev",
  "http://localhost:5174",
];
const configuredSiteOrigin = process.env.APP_SITE_URL ?? "http://localhost:5175";

export const ALLOWED_ORIGINS = [
  configuredStudioOrigin,
  ...configuredPlayerOrigins,
  configuredSiteOrigin,
];
export function isAllowedOrigin(origin: string | undefined): origin is string {
  return origin !== undefined && ALLOWED_ORIGINS.includes(origin);
}

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization";

type HeaderTarget = { setHeader: (name: string, value: string) => void };

function setCredentialedHeaders(res: HeaderTarget, origin: string): void {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  res.setHeader("Vary", "Origin");
}

function setUncredentialedHeaders(res: HeaderTarget): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
}

/**
 * Applies the credentialed-CORS headers to a Node response when `origin` is
 * on the allowlist, and nothing otherwise. For routes that only first-party
 * pages may call, such as `/api/auth` and uploads. Reports whether the caller
 * should treat this as a handled CORS preflight (`OPTIONS`) request.
 */
export function applyCorsHeaders(
  res: HeaderTarget,
  origin: string | undefined,
  method: string | undefined,
): boolean {
  if (isAllowedOrigin(origin)) setCredentialedHeaders(res, origin);
  return method === "OPTIONS";
}

/**
 * Split-horizon CORS for the routes a Player on a Custom Domain calls
 * (GraphQL, `/api/realtime/auth`): the credentialed exact-origin echo for an
 * allowed origin, `*` without credentials for any other. Reports whether the
 * request is a preflight, like `applyCorsHeaders`.
 */
export function applySplitHorizonCorsHeaders(
  res: HeaderTarget,
  origin: string | undefined,
  method: string | undefined,
): boolean {
  if (isAllowedOrigin(origin)) setCredentialedHeaders(res, origin);
  else if (origin !== undefined) setUncredentialedHeaders(res);
  return method === "OPTIONS";
}

/**
 * `*` without credentials for every origin, for public responses that a CDN
 * caches once for all callers (the Player domain resolve route). An echoed
 * origin would be cached and replayed to a different origin.
 */
export function applyPublicCorsHeaders(res: HeaderTarget, method: string | undefined): boolean {
  setUncredentialedHeaders(res);
  return method === "OPTIONS";
}

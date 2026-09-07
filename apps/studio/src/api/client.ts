// The API's GraphQL endpoint. Overridable via VITE_API_URL for pointing at
// a deployed API from local dev, or a different port; defaults to the
// local dev-server started by `pnpm dev:api` (apps/api/src/dev-server.ts).
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const GRAPHQL_ENDPOINT = `${API_BASE_URL}/api/graphql`;

export function resolveApiUrl(path: string): string {
  return new URL(path, `${API_BASE_URL}/`).toString();
}

// The Player's origin. The Studio links out to it — a Device's pairing code
// resolves to a Player session at `/s/<code>` — so it needs to know where
// the Player is served from, and that differs per environment: the checked-in
// Caddy proxy serves it at show.mechane.dev, while a worktree instance on
// direct HTTP gets its own port (see scripts/mechane-worktree.mjs).
export const PLAYER_BASE_URL = import.meta.env.VITE_PLAYER_URL ?? "http://localhost:5174";

/** Where a physical device joins the Show a pairing code belongs to. */
export function playerSessionUrl(pairingCode: string): string {
  return new URL(`/s/${pairingCode}`, PLAYER_BASE_URL).toString();
}

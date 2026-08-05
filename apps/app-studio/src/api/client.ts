// The API's GraphQL endpoint. Overridable via VITE_API_URL for pointing at
// a deployed API from local dev, or a different port; defaults to the
// local dev-server started by `pnpm dev:api` (apps/api/src/dev-server.ts).
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const GRAPHQL_ENDPOINT = `${API_BASE_URL}/api/graphql`;

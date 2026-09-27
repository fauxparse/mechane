// Where the holding page's links and requests go. Both default to the direct
// HTTP dev servers; apps/site/.env points them at the Caddy proxy and each
// deployment sets its own.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const STUDIO_BASE_URL = import.meta.env.VITE_STUDIO_URL ?? "http://localhost:5173";

export const GRAPHQL_ENDPOINT = new URL("/api/graphql", API_BASE_URL).toString();

/** Studio's sign-in screen (apps/studio/src/routes/_guest/sign-in.tsx). */
export const STUDIO_SIGN_IN_URL = new URL("/sign-in", STUDIO_BASE_URL).toString();

/** Studio's dashboard (apps/studio/src/routes/_authenticated/index.tsx). */
export const STUDIO_DASHBOARD_URL = new URL("/", STUDIO_BASE_URL).toString();

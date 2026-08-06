// Better Auth's browser client — talks to apps/api's `/api/auth/*` routes
// (apps/api/src/auth.ts) and, on success, sets the session cookie that every
// subsequent GraphQL request rides along on (see graphql-schema's
// `graphqlRequest`, which sends `credentials: "include"`). This file owns
// only the transport; apps/studio/src/api/auth.ts wraps its methods in
// TanStack Query mutations for the sign-in/sign-up UI to use.
import { createAuthClient } from "better-auth/client";

import { API_BASE_URL } from "./client";

export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
});

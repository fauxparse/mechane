// Better Auth's browser client — talks to apps/api's `/api/auth/*` routes
// (apps/api/src/auth.ts) and, on success, sets the session cookie that every
// subsequent GraphQL request rides along on (see graphql-schema's
// `graphqlRequest`, which sends `credentials: "include"`). This file owns
// only the transport; apps/studio/src/api/auth.ts and ./admin.ts wrap its
// methods in TanStack Query hooks for the UI to use.
//
// The admin plugin client gets the same roles the API's admin plugin checks
// (@mechane/domain/access-control), so its role arguments are typed to them.
import { ac, roles } from "@mechane/domain/access-control";
import { createAuthClient } from "better-auth/client";
import { adminClient } from "better-auth/client/plugins";

import { API_BASE_URL } from "./client";

export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
  plugins: [adminClient({ ac, roles })],
});

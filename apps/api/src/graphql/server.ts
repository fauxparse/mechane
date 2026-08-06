// Shared graphql-yoga instance. This is imported both by the Vercel
// serverless entry point (../../api/graphql.ts) and by the local dev
// server (../dev-server.ts) so the two never drift apart.
import { createYoga } from "graphql-yoga";

import { ALLOWED_ORIGINS } from "../lib/cors";
import { createContext } from "./context";
import { schema } from "./schema";

export const yoga = createYoga({
  schema,
  context: ({ request }) => createContext(request),
  graphqlEndpoint: "/api/graphql",
  // apps/studio sends the Better Auth session cookie with every
  // request (`credentials: "include"`, see graphql-schema's
  // `graphqlRequest`) — that only reaches the browser's response if the
  // origin is explicitly allow-listed (a wildcard "*" is rejected by
  // browsers whenever credentials are involved).
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
});

// Shared graphql-yoga instance. This is imported both by the Vercel
// serverless entry point (../../api/graphql.ts) and by the local dev
// server (../dev-server.ts) so the two never drift apart.
import { createYoga } from "graphql-yoga";

import { createContext } from "./context";
import { schema } from "./schema";

export const yoga = createYoga({
  schema,
  context: ({ request }) => createContext(request),
  graphqlEndpoint: "/api/graphql",
});

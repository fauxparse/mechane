// Shared graphql-yoga instance, served by http-handler.ts for both the
// Vercel entry and the local dev server so the two never drift apart.
import { createYoga } from "graphql-yoga";

import { createContext } from "./context";
import { schema } from "./schema";

export const yoga = createYoga({
  schema,
  context: ({ request }) => createContext(request),
  graphqlEndpoint: "/api/graphql",
  // CORS is applied by http-handler.ts before a request reaches Yoga, with
  // the split-horizon policy the Player's Custom Domains need (lib/cors.ts,
  // ADR-0023). Yoga's own handling would answer foreign origins differently.
  cors: false,
});

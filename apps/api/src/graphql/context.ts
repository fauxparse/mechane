// GraphQL request context: who (if anyone) is signed in, resolved from the
// Better Auth session cookie on the incoming request.
import { GraphQLError } from "graphql";

import { auth } from "../auth";

export interface GraphQLContext {
  userId: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
  } | null;
}

export async function createContext(request: Request): Promise<GraphQLContext> {
  const session = await auth.api.getSession({ headers: request.headers });
  return { userId: session?.user.id ?? null, user: session?.user ?? null };
}

/**
 * Every resolver that reads/writes an owned resource (Show, etc.) should
 * call this first — it's the single point where "must be signed in" is
 * enforced, so resolvers don't each re-derive their own unauthenticated
 * error. Pair with @mechane/domain's `assertOwnedBy` once a resource has
 * been fetched, to enforce "owns *this* resource" as well as "is signed in".
 */
export function requireUserId(context: GraphQLContext): string {
  if (!context.userId) {
    throw new GraphQLError("You must be signed in to do that.", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return context.userId;
}

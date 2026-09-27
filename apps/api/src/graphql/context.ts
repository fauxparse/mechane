// GraphQL request context: who (if anyone) is signed in, resolved from the
// Better Auth session cookie on the incoming request.
import { GraphQLError, type GraphQLFieldResolver } from "graphql";

import { statements } from "../access-control";
import { auth } from "../auth";
import { clientAddress } from "../lib/client-address";

export interface GraphQLContext {
  userId: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
  } | null;
  playerPairingCode?: string | null;
  /** Rate-limit key for the caller's network; see ../lib/client-address.ts. */
  clientAddress?: string | null;
}

/**
 * One slice's resolver map: GraphQL type name → that type's field (or
 * `__resolveType`) resolvers. Slice modules export one of these alongside
 * their `typeDefs`; ./schema.ts assembles them into the served schema.
 */
export type Resolvers = Record<string, Record<string, GraphQLFieldResolver<never, GraphQLContext>>>;
function bearerCredential(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const credential = header.slice("Bearer ".length).trim();
  return credential.length > 0 ? credential : null;
}

export async function createContext(request: Request): Promise<GraphQLContext> {
  const session = await auth.api.getSession({ headers: request.headers });
  return {
    userId: session?.user.id ?? null,
    user: session?.user ?? null,
    playerPairingCode: bearerCredential(request),
    clientAddress: clientAddress(request.headers),
  };
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

/** Resource → actions, as declared in ../access-control.ts. */
export type Permissions = {
  [Resource in keyof typeof statements]?: (typeof statements)[Resource][number][];
};

/**
 * Role-based authorization for resolvers (issue #810): signed in *and* the
 * user's role (../access-control.ts) grants every listed action. The role is
 * read from the database on each check, so a role change takes effect on the
 * next request rather than when the session expires.
 */
export async function requirePermission(
  context: GraphQLContext,
  permissions: Permissions,
): Promise<string> {
  const userId = requireUserId(context);
  const { success } = await auth.api.userHasPermission({ body: { userId, permissions } });
  if (!success) {
    throw new GraphQLError("You are not allowed to do that.", {
      extensions: { code: "FORBIDDEN" },
    });
  }
  return userId;
}

export function requirePlayerPairingCode(context: GraphQLContext): string {
  if (!context.playerPairingCode) {
    throw new GraphQLError("Player is unavailable.", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return context.playerPairingCode;
}

// Role-based authorization (issues #810, #826): the single definition of
// which roles exist and what each may do. It lives in the domain package so
// that the API and Studio read the same definition: Better Auth's admin plugin
// (apps/api/src/auth.ts) stores one role per user (`user.role`) and checks
// every admin endpoint against these roles; GraphQL resolvers check them
// through `requirePermission` (apps/api/src/graphql/context.ts); Studio's
// admin client (apps/studio/src/api/auth-client.ts) and `roleCan` below decide
// what the signed-in user is offered.
//
// To add a capability, add a resource/action to `statements`, then grant it
// to the roles that need it. To add a role, add it to `roles`. The admin
// plugin's own endpoints need its `defaultStatements` resources (`user`,
// `session`), so those stay in the statement set.
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, userAc } from "better-auth/plugins/admin/access";

export const statements = {
  ...defaultStatements,
  /** Any user's Shows, as opposed to the caller's own (those need ownership, not a role). */
  show: ["list", "delete"],
} as const;

export const ac = createAccessControl(statements);

export const roles = {
  /** Every account; owns its Shows but administers nothing. */
  user: ac.newRole({ ...userAc.statements }),
  /** System administrator: manages users, their sessions, and their Shows. */
  admin: ac.newRole({ ...adminAc.statements, show: ["list", "delete"] }),
};

export type Role = keyof typeof roles;

export const ROLES = Object.keys(roles) as Role[];

export const DEFAULT_ROLE = "user" satisfies Role;
export const ADMIN_ROLES: Role[] = ["admin"];

/** Resource → actions, as declared in `statements`. */
export type Permissions = {
  [Resource in keyof typeof statements]?: (typeof statements)[Resource][number][];
};

/** What the admin area needs: finding users, and the Shows they own. */
export const ADMIN_AREA_PERMISSIONS: Permissions = { user: ["list"], show: ["list"] };

export function isRole(value: string): value is Role {
  return Object.hasOwn(roles, value);
}

/**
 * Whether `role` grants every listed action. An unknown role grants nothing.
 * The API enforces permissions itself; Studio uses this only to decide what
 * to offer.
 */
export function roleCan(role: string, permissions: Permissions): boolean {
  return isRole(role) && roles[role].authorize(permissions).success;
}

/**
 * Whether `role` may impersonate an account whose role is `targetRole`: the
 * admin plugin's rule, which needs `user.impersonate`, plus
 * `user.impersonate-admins` when the target holds an admin role. Like
 * `roleCan`, this only decides what Studio offers.
 */
export function roleCanImpersonate(role: string, targetRole: string): boolean {
  const targetIsAdmin = isRole(targetRole) && ADMIN_ROLES.includes(targetRole);
  return roleCan(role, {
    user: targetIsAdmin ? ["impersonate", "impersonate-admins"] : ["impersonate"],
  });
}

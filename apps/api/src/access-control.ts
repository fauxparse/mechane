// Role-based authorization (issue #810): the single definition of which
// roles exist and what each may do. Better Auth's admin plugin (./auth.ts)
// stores one role per user (`user.role`) and checks every admin endpoint
// against these roles; GraphQL resolvers check the same roles through
// `requirePermission` in ./graphql/context.ts.
//
// To add a capability, add a resource/action to `statements`, then grant it
// to the roles that need it. To add a role, add it to `roles`. The admin
// plugin's own endpoints need its `defaultStatements` resources (`user`,
// `session`), so those stay in the statement set.
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, userAc } from "better-auth/plugins/admin/access";

export const statements = {
  ...defaultStatements,
} as const;

export const ac = createAccessControl(statements);

export const roles = {
  /** Every account; owns its Shows but administers nothing. */
  user: ac.newRole({ ...userAc.statements }),
  /** System administrator: manages users and their sessions. */
  admin: ac.newRole({ ...adminAc.statements }),
};

export type Role = keyof typeof roles;

export const DEFAULT_ROLE = "user" satisfies Role;
export const ADMIN_ROLES: Role[] = ["admin"];

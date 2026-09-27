# System roles come from Better Auth's admin plugin

- Status: Accepted
- Issue: #810

## Decision

Authorization is role-based and handled by Better Auth's admin plugin, configured with an explicit access-control definition in `apps/api/src/access-control.ts`. That module declares the resources and actions (`statements`) and the roles that grant them. There are two roles today: `user`, which every account gets and which administers nothing, and `admin`, which may manage users and their sessions through the plugin's `/api/auth/admin/*` endpoints.

The role is a non-null `user.role` column defaulting to `user`, next to the plugin's ban fields and `session.impersonated_by`. GraphQL resolvers call `requirePermission(context, { resource: [actions] })` in `graphql/context.ts`. It uses the same role definitions as the plugin's endpoints and reads the role from the database on every check. A demotion therefore takes effect on the caller's next request, not when their session expires.

Alternatives considered:

- **Organization plugin**: its roles are per organization. Mechanē has no organizations (PRD.md §1, §9), and system administration is not scoped to one.
- **External policy engine (Casbin, Permit.io, OpenFGA)**: adds a second source of truth for identity, and a policy store or network hop, to answer a question two roles can answer. Revisit if authorization ever depends on relationships between resources rather than on who the user is.
- **`adminUserIds` allow-list in config**: grants admin rights to the id itself. Changing who is an admin would mean a deploy, and there would be no role for anything short of full admin.

## Consequences

- Adding a level means adding a role (and, if needed, statements) in one module. The `user`/`session` statements must remain, because the plugin's endpoints check them.
- Show ownership is unchanged: `requireUserId` plus `assertOwnedBy` still decide who may touch a Show. Roles grant system-wide capabilities; they do not replace ownership checks.
- Admins can ban users and impersonate non-admin users. The plugin rejects sign-in for banned users and marks impersonation sessions with `impersonated_by`.
- The role is not exposed through GraphQL, and Studio does not load the plugin's client yet. An admin UI would add both.

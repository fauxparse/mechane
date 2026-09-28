// The admin area ("/admin", issue #826). Nested under `_authenticated`, whose
// guard has already sent signed-out visitors to /sign-in; this one sends
// signed-in users whose role lacks the admin area's permissions
// (@mechane/domain/access-control) back to their Shows. It only decides what
// to offer: every admin request is checked again by the API.
import { buttonVariants } from "@mechane/design-system";
import { ADMIN_AREA_PERMISSIONS, roleCan } from "@mechane/domain/access-control";
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";

import { useSignOut } from "../../../api/auth";
import { meQueryOptions, useMe } from "../../../api/me";
import { DashboardHeader } from "../../../components/Dashboard/DashboardHeader";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions());
    if (!me || !roleCan(me.role, ADMIN_AREA_PERMISSIONS)) {
      throw redirect({ to: "/" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const me = useMe();
  const signOut = useSignOut();

  return (
    <div className="min-h-screen bg-sunken">
      <div className="border-b border-border bg-background">
        <DashboardHeader
          user={{
            id: me.data?.id ?? "unknown",
            name: me.data?.name,
            email: me.data?.email ?? "",
            avatarUrl: null,
          }}
          onLogOut={() => signOut.mutate()}
          actions={
            <Link to="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Back to Shows
            </Link>
          }
        />
      </div>
      <main className="mx-auto w-full max-w-5xl px-6 pb-16 pt-8">
        <Outlet />
      </main>
    </div>
  );
}

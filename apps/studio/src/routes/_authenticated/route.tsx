// Pathless layout route (the `_` prefix on the directory keeps it out of
// the URL, issue #30): centralizes the "signed in?" guard that the dashboard,
// settings and sign-in screens used to each duplicate as a component-level
// `useMe` + `<Navigate>` check. Redirecting from `beforeLoad` happens
// before the route renders, so there's no flash-of-wrong-content and no
// per-route "Loading…" placeholder needed.
//
// Every signed-in screen sits under this layout, so it is also where the
// impersonation banner (issue #845) goes: above whatever screen is open.
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { useStopImpersonating } from "../../api/impersonation";
import { meQueryOptions, useMe } from "../../api/me";
import { ImpersonationBanner } from "../../components/Impersonation/ImpersonationBanner";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions());
    if (!me) {
      throw redirect({ to: "/sign-in" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const me = useMe();
  const stopImpersonating = useStopImpersonating();
  const impersonated = me.data?.impersonator ? me.data : null;

  return (
    <>
      {impersonated ? (
        <ImpersonationBanner
          user={impersonated}
          onStop={() => stopImpersonating.mutate(impersonated.id)}
          // Success reloads the page; stay disabled until it does.
          stopping={stopImpersonating.isPending || stopImpersonating.isSuccess}
          error={stopImpersonating.error?.message}
        />
      ) : null}
      <Outlet />
    </>
  );
}

// Pathless layout route (the `_` filename prefix keeps it out of the URL,
// issue #30): centralizes the "signed in?" guard that the dashboard,
// settings and sign-in screens used to each duplicate as a component-level
// `useMe` + `<Navigate>` check. Redirecting from `beforeLoad` happens
// before the route renders, so there's no flash-of-wrong-content and no
// per-route "Loading…" placeholder needed.
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { meQueryOptions } from "../api/me";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions());
    if (!me) {
      throw redirect({ to: "/sign-in" });
    }
  },
  component: () => <Outlet />,
});

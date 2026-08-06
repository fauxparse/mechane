// The mirror image of `_authenticated` — signed-in visitors hitting
// /sign-in land on the dashboard instead (issue #13's route-guard
// requirement).
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { meQueryOptions } from "../../api/me";

export const Route = createFileRoute("/_guest")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions());
    if (me) {
      throw redirect({ to: "/" });
    }
  },
  component: () => <Outlet />,
});

// Code-based TanStack Router setup (no file-based-routing plugin wired up
// yet — this is deliberately the minimal shape for the app's small number
// of screens; later tickets can migrate to file-based routing if the route
// tree grows enough to want it).
import { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";

import { meQueryOptions } from "./api/me";
import { DashboardRoute } from "./routes/DashboardRoute";
import { SettingsRoute } from "./routes/SettingsRoute";
import { ShowDetailRoute } from "./routes/ShowDetailRoute";
import { SignInRoute } from "./routes/SignInRoute";

// Shared with main.tsx's QueryClientProvider — the router's `beforeLoad`
// guards below and the app's components read/write the same cache.
export const queryClient = new QueryClient();

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});

// Pathless layout route (the `_` prefix on `id` keeps it out of the URL,
// issue #30): centralizes the "signed in?" guard
// that DashboardRoute/SettingsRoute/SignInRoute used to each duplicate as a
// component-level `useMe` + `<Navigate>` check. Redirecting from
// `beforeLoad` happens before the route renders, so there's no
// flash-of-wrong-content and no per-route "Loading…" placeholder needed.
const authenticatedRoute = createRoute({
  id: "_authenticated",
  getParentRoute: () => rootRoute,
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions());
    if (!me) {
      throw redirect({ to: "/sign-in" });
    }
  },
  component: () => <Outlet />,
});

// The mirror image of `authenticatedRoute` — signed-in visitors hitting
// /sign-in land on the dashboard instead (issue #13's route-guard
// requirement).
const guestRoute = createRoute({
  id: "_guest",
  getParentRoute: () => rootRoute,
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions());
    if (me) {
      throw redirect({ to: "/" });
    }
  },
  component: () => <Outlet />,
});

// The post-login home base (issue #13).
const dashboardRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/",
  component: DashboardRoute,
});

// Sign-in/sign-up (issue #13).
const signInRoute = createRoute({
  getParentRoute: () => guestRoute,
  path: "/sign-in",
  component: SignInRoute,
});

const showDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/shows/$showId",
  component: ShowDetailRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/settings",
  component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([dashboardRoute, showDetailRoute, settingsRoute]),
  guestRoute.addChildren([signInRoute]),
]);

export const router = createRouter({ routeTree, context: { queryClient } });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

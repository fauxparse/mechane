// Code-based TanStack Router setup (no file-based-routing plugin wired up
// yet — this is deliberately the minimal shape for the app's small number
// of screens; later tickets can migrate to file-based routing if the route
// tree grows enough to want it).
import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";

import { DashboardRoute } from "./routes/DashboardRoute";
import { SettingsRoute } from "./routes/SettingsRoute";
import { ShowDetailRoute } from "./routes/ShowDetailRoute";
import { SignInRoute } from "./routes/SignInRoute";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// The post-login home base (issue #13) — signed-out visitors are redirected
// to /sign-in by DashboardRoute itself (see its `useMe` guard).
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardRoute,
});

// Sign-in/sign-up (issue #13) — signed-in visitors are redirected to "/" by
// SignInRoute itself (see its `useMe` guard).
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  component: SignInRoute,
});

const showDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shows/$showId",
  component: ShowDetailRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  signInRoute,
  showDetailRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Code-based TanStack Router setup (no file-based-routing plugin wired up
// yet — this is deliberately the minimal shape for the two Show screens;
// later tickets can migrate to file-based routing if the route tree grows
// enough to want it).
import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";

import { SettingsRoute } from "./routes/SettingsRoute";
import { ShowDetailRoute } from "./routes/ShowDetailRoute";
import { ShowsListRoute } from "./routes/ShowsListRoute";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const showsListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ShowsListRoute,
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

const routeTree = rootRoute.addChildren([showsListRoute, showDetailRoute, settingsRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

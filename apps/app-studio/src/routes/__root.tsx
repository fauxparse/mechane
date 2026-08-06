// The root of the file-based route tree (issue #32). Every other file in
// this directory is discovered by @tanstack/router-plugin and wired into
// `routeTree.gen.ts` — there is no hand-maintained route tree any more.
//
// The router's context type lives here rather than in router.tsx because
// the generated tree imports *this* file; router.tsx imports the generated
// tree. Declaring it here keeps that dependency one-directional.
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});

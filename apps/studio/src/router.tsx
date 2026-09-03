// File-based TanStack Router setup (issue #32). The route tree lives in
// `src/routes/` and is compiled into `routeTree.gen.ts` by
// @tanstack/router-plugin (see vite.config.ts) — nothing here is wired by
// hand any more. This file only owns the two things codegen can't: the
// shared QueryClient and the router instance built around it.
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

const CANVAS_EDITOR_PATH = /^\/shows\/[^/]+\/art(?:\/[^/]+)?\/?$/;
const SHOW_EDITOR_PATH = /^\/shows\/[^/]+(?:\/shapes(?:\/[^/]+)?)?\/?$/;

function editorKindForPath(pathname: string): "show" | "canvas" | null {
  if (CANVAS_EDITOR_PATH.test(pathname)) return "canvas";
  if (SHOW_EDITOR_PATH.test(pathname)) return "show";
  return null;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  );
}

// Shared with main.tsx's QueryClientProvider — the route guards'
// `beforeLoad` (src/routes/_authenticated/route.tsx and
// `src/routes/_guest/route.tsx) and the app's components read/write the
// same cache.
export const queryClient = new QueryClient();

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultViewTransition: {
    types: ({ fromLocation, toLocation }) => {
      if (prefersReducedMotion() || !fromLocation) return false;

      const fromEditor = editorKindForPath(fromLocation.pathname);
      const toEditor = editorKindForPath(toLocation.pathname);
      return fromEditor && toEditor && fromEditor !== toEditor ? ["studio-editor"] : false;
    },
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

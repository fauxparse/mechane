// A memory router for stories whose components render router `<Link>`s. Every
// path renders the story, so following a link leaves it on screen rather than
// on a not-found page; the destination is still the link's real href.
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createContext, useContext, useState, type PropsWithChildren, type ReactNode } from "react";

const StoryContentContext = createContext<ReactNode>(null);

function StoryContent() {
  return useContext(StoryContentContext);
}

function createStoryRouter() {
  const rootRoute = createRootRoute({ component: StoryContent });
  const anyPath = createRoute({ getParentRoute: () => rootRoute, path: "$" });
  return createRouter({
    routeTree: rootRoute.addChildren([anyPath]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
}

export function StoryRouter({ children }: PropsWithChildren) {
  const [router] = useState(createStoryRouter);
  return (
    <StoryContentContext.Provider value={children}>
      <RouterProvider router={router} />
    </StoryContentContext.Provider>
  );
}

// The default Show editor surface. The sibling art route owns the Canvas
// workspace; this index route owns the graph command stack.
import { createFileRoute } from "@tanstack/react-router";

import { ShowGraphIndexRoute } from "./-show-graph-route";

export const Route = createFileRoute("/_authenticated/shows/$showId/")({
  component: ShowGraphIndexRoute,
});

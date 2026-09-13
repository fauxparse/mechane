// The default Show editor surface. The sibling art route owns the Canvas
// workspace; this index route owns the graph command stack.
import type { ShowId } from "@mechane/domain";
import { createFileRoute } from "@tanstack/react-router";

import { ShowGraphRoute } from "./-show-graph-route";

export const Route = createFileRoute("/_authenticated/shows/$showId/")({
  component: ShowGraphIndexRoute,
});

export function ShowGraphIndexRoute() {
  const params = Route.useParams();
  return <ShowGraphRoute showId={params.showId as ShowId} />;
}

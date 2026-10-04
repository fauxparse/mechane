// The Show editor surface: a pathless layout over the graph's index and its
// masked source-value route. The sibling art route owns the Canvas workspace;
// this layout owns the graph command stack, so opening or closing a value
// dialog changes only the child route and never remounts the editor.
import { createFileRoute } from "@tanstack/react-router";

import { ShowGraphPage } from "./-show-graph-route";

export const Route = createFileRoute("/_authenticated/shows/$showId/_graph")({
  component: ShowGraphPage,
});

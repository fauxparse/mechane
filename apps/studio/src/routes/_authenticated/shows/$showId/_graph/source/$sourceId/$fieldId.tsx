import { createFileRoute } from "@tanstack/react-router";

// The parent layout renders the Show editor and reads these params to open the
// value dialog; this route only contributes the location.
export const Route = createFileRoute(
  "/_authenticated/shows/$showId/_graph/source/$sourceId/$fieldId",
)({
  component: () => null,
});

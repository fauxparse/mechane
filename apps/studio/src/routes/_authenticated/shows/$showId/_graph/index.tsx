import { createFileRoute } from "@tanstack/react-router";

// The parent layout renders the Show editor; this route only means "no value
// dialog open".
export const Route = createFileRoute("/_authenticated/shows/$showId/_graph/")({
  component: () => null,
});

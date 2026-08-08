import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/shows/$showId/art/$artId")({
  // The parent owns the workspace query and editor state. This route only
  // contributes the focus context encoded in the URL, so changing artId never
  // remounts the Canvas command/session provider.
  component: () => null,
});

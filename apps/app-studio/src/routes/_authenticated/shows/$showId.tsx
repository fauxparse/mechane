// The Show editor — "/shows/$showId" (issue #39). Opening a Show *is*
// opening the editor (#22): no landing page, no separate /editor route.
//
// This replaces the old Show detail screen. Rename and delete used to be
// this route's entire content; they're now items on the Show-name dropdown
// in the chrome, which is where #22 puts them — two rarely-used actions
// don't earn a screen of their own, and the screen they had is needed for
// the canvas. No behaviour was dropped in the move.
//
// The layout deliberately opts out of the `max-w-2xl` centering the
// dashboard and settings use: the canvas is full-bleed, and the chrome
// floats over it.
//
// `useShow` scopes to the signed-in user server-side (see apps/api's `show`
// resolver), so an id belonging to someone else resolves to null here
// rather than leaking its existence.
//
// Leaving with unpublished changes prompts nothing, on purpose (#22): the
// draft lives server-side (ADR-0002), so leaving and coming back resumes
// exactly the same in-progress state.
import { isId, publishState } from "@presence/domain";
import type { ShowId } from "@presence/domain";
import { GraphQLRequestError } from "@presence/graphql-schema";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { usePublishShowGraph, useShowGraph } from "../../../api/show-graph";
import { useDeleteShow, useRenameShow, useShow } from "../../../api/shows";
import { ShowEditorChrome } from "../../../components/ShowEditorChrome";

export const Route = createFileRoute("/_authenticated/shows/$showId")({
  component: ShowEditorRoute,
});

function ShowEditorRoute() {
  const params = Route.useParams();
  // The one place a Show id arrives from outside the system, so the one
  // place it gets validated (issue #47). An id that isn't well-formed
  // can't match any Show, and says so without a round trip.
  const showId: ShowId | null = isId("show", params.showId) ? params.showId : null;
  const navigate = useNavigate();
  const show = useShow(showId);
  // Both states of the graph: the badge is the comparison between them
  // (ADR-0002 stores no "dirty" flag).
  const draft = useShowGraph(showId, "draft");
  const published = useShowGraph(showId, "published");
  const renameShow = useRenameShow();
  const deleteShow = useDeleteShow();
  const publish = usePublishShowGraph();

  if (showId !== null && show.isPending) {
    return <p className="p-6 text-muted-foreground">Loading…</p>;
  }

  if (showId === null || show.isError || !show.data) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
        <p role="alert">This Show doesn't exist, or isn't yours.</p>
        <Link to="/">Back to Shows</Link>
      </main>
    );
  }

  const currentShow = show.data;
  // Until both graphs have loaded there's nothing to compare, so the badge
  // shows the quietest of the three states rather than flickering through
  // "Unpublished changes" on the way in.
  const state =
    draft.data && published.data
      ? publishState(draft.data.updatedAt, published.data.updatedAt)
      : "empty";

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <ShowEditorChrome
        name={currentShow.name}
        publishState={state}
        onBack={() => navigate({ to: "/" })}
        onRename={(name) => renameShow.mutate({ id: currentShow.id, name })}
        onDelete={() => {
          deleteShow.mutate(currentShow.id, {
            onSuccess: () => navigate({ to: "/" }),
          });
        }}
        onPublish={() => publish.mutate(currentShow.id)}
        renaming={renameShow.isPending}
        renameError={
          renameShow.error instanceof GraphQLRequestError ? renameShow.error.message : undefined
        }
        deleting={deleteShow.isPending}
        publishing={publish.isPending}
      />

      {/* The canvas itself is issue #40's — this is the space it will fill. */}
      <div className="flex h-full w-full items-center justify-center bg-muted/20">
        <p className="text-sm text-muted-foreground">The canvas goes here.</p>
      </div>
    </div>
  );
}

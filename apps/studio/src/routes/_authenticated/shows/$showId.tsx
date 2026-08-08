// The shared Show editor layout for "/shows/$showId" (issue #39).
//
// The index child owns the graph editor, while art.tsx owns the Canvas
// workspace. Keeping those editors in sibling routes lets TanStack Router
// select the correct surface instead of making the layout inspect pathname
// strings or render one editor beside the other.
import { isId, publishState } from "@mechane/domain";
import type { ShowId } from "@mechane/domain";
import { GraphQLRequestError } from "@mechane/graphql-schema";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";

import { usePublishShowGraph, useShowGraph } from "../../../api/show-graph";
import { useActiveRun, useEndRun, useStartRun } from "../../../api/runs";
import { useDeleteShow, useRenameShow, useShow } from "../../../api/shows";
import { ShowEditorChrome } from "../../../components/ShowEditorChrome";

export const Route = createFileRoute("/_authenticated/shows/$showId")({
  component: ShowEditorLayout,
});

function ShowEditorLayout() {
  const params = Route.useParams();
  // The one place a Show id arrives from outside the system, so the one
  // place it gets validated (issue #47).
  const showId: ShowId | null = isId("show", params.showId) ? params.showId : null;
  const navigate = useNavigate();
  const show = useShow(showId);
  // Both graph states feed the publish badge. The index child owns the draft
  // snapshot used by the graph command stack.
  const draft = useShowGraph(showId, "draft");
  const published = useShowGraph(showId, "published");
  const activeRun = useActiveRun(showId);
  const renameShow = useRenameShow();
  const deleteShow = useDeleteShow();
  const publish = usePublishShowGraph();
  const startRun = useStartRun();
  const endRun = useEndRun();

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
  const state =
    draft.data && published.data
      ? publishState(draft.data.updatedAt, published.data.updatedAt)
      : "empty";

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <ShowEditorChrome
        name={currentShow.name}
        publishState={state}
        onBack={() => void navigate({ to: "/" })}
        onOpenCanvas={() =>
          void navigate({ to: "/shows/$showId/art", params: { showId: params.showId } })
        }
        onRename={(name) => renameShow.mutate({ id: currentShow.id, name })}
        onDelete={() => {
          deleteShow.mutate(currentShow.id, {
            onSuccess: () => void navigate({ to: "/" }),
          });
        }}
        onPublish={() => publish.mutate(currentShow.id)}
        runActive={activeRun.data !== null && activeRun.data !== undefined}
        onStartRun={() => startRun.mutate(currentShow.id)}
        onEndRun={() => endRun.mutate(currentShow.id)}
        runPending={startRun.isPending || endRun.isPending}
        renaming={renameShow.isPending}
        renameError={
          renameShow.error instanceof GraphQLRequestError ? renameShow.error.message : undefined
        }
        deleting={deleteShow.isPending}
        publishing={publish.isPending}
      />
      <Outlet />
    </div>
  );
}

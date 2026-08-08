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
// dashboard and settings use: the editor is full-bleed, and the chrome
// floats over it.
//
// `useShow` scopes to the signed-in user server-side (see apps/api's `show`
// resolver), so an id belonging to someone else resolves to null here
// rather than leaking its existence.
//
// Leaving with unpublished changes prompts nothing, on purpose (#22): the
// draft lives server-side (ADR-0002), so leaving and coming back resumes
// exactly the same in-progress state.
import { isId, publishState } from "@mechane/domain";
import type { ShowId } from "@mechane/domain";
import { GraphQLRequestError } from "@mechane/graphql-schema";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useSceneCanvas } from "../../../api/canvas";
import { usePublishShowGraph, useShowGraph, useShowGraphEdits } from "../../../api/show-graph";
import { useActiveRun, useEndRun, useStartRun } from "../../../api/runs";
import { useDeleteShow, useRenameShow, useShow } from "../../../api/shows";
import { ShowEditorChrome } from "../../../components/ShowEditorChrome";
import { SceneCanvasEditor } from "../../../editors/scene/SceneCanvasEditor";
import { ShowGraphEditor } from "../../../editors/show/ShowGraphEditor";
import type { ShowGraphEditorHandle } from "../../../editors/show/ShowGraphEditor";

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
  const activeRun = useActiveRun(showId);
  const [sceneNodeId, setSceneNodeId] = useState<string | null>(null);
  const sceneCanvas = useSceneCanvas(showId, sceneNodeId, "draft");
  // Seeded with the version the draft was read at: every edit batch says
  // which graph it was composed against (#103), and the first one has to get
  // that from the read that opened the editor.
  //
  // `onAmend` is the way back in (#111): what the server decided for itself —
  // a new Device's pairing code — has to reach the graph the editor is
  // holding, and the editor is the only thing that has it.
  const editor = useRef<ShowGraphEditorHandle>(null);
  const saveGraph = useShowGraphEdits(showId, draft.data?.version, {
    onAmend: (edits) => editor.current?.applyAmendments(edits),
  });
  const renameShow = useRenameShow();
  const deleteShow = useDeleteShow();
  const publish = usePublishShowGraph();
  const startRun = useStartRun();
  const endRun = useEndRun();

  // The graph the editor *opens* with, captured once. After that the editor
  // owns it: it holds the draft in a command stack (#41), and handing it a new
  // object — which every save does, since the response refreshes the cache for
  // the badge — would reset that stack and throw the undo history away. A
  // refetch is not a different document.
  const [openedWith, setOpenedWith] = useState<typeof draft.data | null>(null);
  useEffect(() => {
    if (draft.data && !openedWith) setOpenedWith(draft.data);
  }, [draft.data, openedWith]);
  // Which is also why "is the Show still empty?" is tracked here rather than
  // read back off `openedWith`: that snapshot never changes again.
  const [edited, setEdited] = useState(false);

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

      {sceneNodeId ? (
        sceneCanvas.isPending ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading Scene Canvas…
          </p>
        ) : sceneCanvas.isError ? (
          <p role="alert" className="flex h-full items-center justify-center text-sm text-destructive">
            Unable to load Scene Canvas: {sceneCanvas.error.message}
          </p>
        ) : sceneCanvas.data ? (
          <SceneCanvasEditor
            canvas={sceneCanvas.data}
            onBack={() => setSceneNodeId(null)}
            onEdit={(edits) => {
              const canvasId = sceneCanvas.data.id;
              setEdited(true);
              saveGraph.enqueue(edits.map((edit) => ({ ...edit, canvasId })));
            }}
          />
        ) : null
      ) : (
        <ShowGraphEditor
          ref={editor}
          graph={openedWith}
          onOpenScene={setSceneNodeId}
          onEdit={(edits) => {
            setEdited(true);
            saveGraph.enqueue(edits);
          }}
        />
      )}

      {saveGraph.error ? (
        // A refused batch is the one failure the director has to know about:
        // the editor still works, but nothing more is being written, and the
        // way back is to reload and pick up the stored draft.
        <p
          role="alert"
          className="absolute inset-x-0 bottom-0 bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground"
        >
          Your changes couldn't be saved: {saveGraph.error.message} Reload to pick up the stored
          draft.
        </p>
      ) : null}

      {openedWith && openedWith.nodes.length === 0 && !edited ? (
        // An empty Show is valid and unremarkable (#25), but an empty
        // grid with no explanation reads as a failure to load.
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Nothing here yet. Right-click the canvas, or press ⌘K, to create something.
        </p>
      ) : null}
    </div>
  );
}

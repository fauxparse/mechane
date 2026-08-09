import { isId } from "@mechane/domain";
import type { ShowId } from "@mechane/domain";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { useCanvasWorkspace } from "../../../../api/canvas";
import { useShow } from "../../../../api/shows";
import { useShowGraph, useShowGraphEdits } from "../../../../api/show-graph";
import { CanvasWorkspaceEditor } from "../../../../editors/canvas/CanvasWorkspaceEditor";
import { artIdFromPath, resolveFocusedArtboard } from "../../../../editors/canvas/canvas-workspace";
import { useCanvasCommands } from "../../../../editors/canvas/use-canvas-commands";
import { useUndoKeys } from "../../../../editors/show/keyboard/use-undo-keys";
export const Route = createFileRoute("/_authenticated/shows/$showId/art")({
  component: CanvasWorkspaceRoute,
});

function CanvasWorkspaceRoute() {
  const params = Route.useParams();
  const showId: ShowId | null = isId("show", params.showId) ? params.showId : null;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const show = useShow(showId);
  const draft = useShowGraph(showId, "draft");
  const workspace = useCanvasWorkspace(showId);
  const save = useShowGraphEdits(showId, draft.data?.version);
  const commands = useCanvasCommands(workspace.data, (edits) => save.enqueue(edits));
  useUndoKeys(commands);
  const artboards = useMemo(() => {
    const current = new Map(commands.workspace.artboards.map((artboard) => [artboard.canvasId, artboard]));
    return (workspace.data ?? []).map((artboard) => {
      const edited = current.get(artboard.canvasId);
      return edited
        ? { ...artboard, canvas: edited.canvas, position: edited.position }
        : artboard;
    });
  }, [commands.workspace.artboards, workspace.data]);
  const requestedArtId = showId ? artIdFromPath(pathname, showId) : null;
  const focused = resolveFocusedArtboard(artboards, requestedArtId);

  useEffect(() => {
    if (!workspace.data) return;
    // An artboard is always active, so the URL should name it — landing on the bare /art route
    // leaves the address bar disagreeing with the editor, and un-shareable.
    if (!requestedArtId) {
      if (focused) {
        void navigate({
          to: "/shows/$showId/art/$artId",
          params: { showId: params.showId, artId: focused.artId },
          replace: true,
        });
      }
      return;
    }
    if (!focused || (focused.artId !== requestedArtId && focused.canvasId !== requestedArtId)) {
      void navigate({
        to: "/shows/$showId/art",
        params: { showId: params.showId },
        replace: true,
      });
    }
  }, [focused, navigate, params.showId, requestedArtId, workspace.data]);

  if (showId === null || show.isError || !show.data) {
    return (
      <p className="p-6" role="alert">
        This Show doesn't exist, or isn't yours.
      </p>
    );
  }
  if (show.isPending || workspace.isPending || draft.isPending) {
    return <p className="p-6 text-muted-foreground">Loading Canvas workspace…</p>;
  }
  if (workspace.isError || draft.isError) {
    return (
      <p className="p-6" role="alert">
        Canvas workspace couldn't be loaded.
      </p>
    );
  }

  return (
    <CanvasWorkspaceEditor
      artboards={artboards}
      focusedArtId={focused?.artId ?? null}
      onFocusArtboard={(artId) =>
        void navigate({
          to: "/shows/$showId/art/$artId",
          params: { showId: params.showId, artId },
          replace: true,
        })
      }
      onBeginMoveArtboard={commands.beginArtboardMove}
      onMoveArtboard={commands.updateArtboardMove}
      onEndMoveArtboard={commands.endArtboardMove}
      onCreateElement={commands.createElement}
      onMoveElement={commands.moveElement}
      onUpdateElement={commands.updateElement}
    />
  );
}

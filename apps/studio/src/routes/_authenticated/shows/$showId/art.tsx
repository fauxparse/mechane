import { type ShowId, isId } from "@mechane/domain/id";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

import { useShow } from "../../../../api/shows";
import { CanvasWorkspaceEditor } from "../../../../editors/canvas/CanvasWorkspaceEditor";
import { useCanvasWorkspaceSession } from "../../../../editors/canvas/commands/use-canvas-workspace-session";
import { artIdFromPath, isCanvasPath } from "../../../../editors/canvas/data/canvas-workspace";

export const Route = createFileRoute("/_authenticated/shows/$showId/art")({
  component: CanvasWorkspaceRoute,
});

// This route owns the URL's side of the Canvas workspace — which Artboard the
// address bar names, keeping it truthful, and navigating to a Cue's Show — and
// otherwise renders the editor over the session. Editing, persistence, and
// derivation live in the session module.
function CanvasWorkspaceRoute() {
  const params = Route.useParams();
  const showId: ShowId | null = isId("show", params.showId) ? params.showId : null;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const show = useShow(showId);

  const requestedArtId = showId ? artIdFromPath(pathname, showId) : null;
  const focusArtboard = useCallback(
    (artId: string) => {
      void navigate({
        to: "/shows/$showId/art/$artId",
        params: { showId: params.showId, artId },
        replace: true,
      });
    },
    [navigate, params.showId],
  );
  const focusCue = useCallback(
    (_cueId: string) => {
      if (showId) void navigate({ to: "/shows/$showId", params: { showId } });
    },
    [navigate, showId],
  );
  const workspace = useCanvasWorkspaceSession({
    showId,
    requestedArtId,
    focusArtboard,
    focusCue,
  });
  const focused = workspace.focused;

  // This route stays mounted for a moment while the router transitions away
  // from it, and during that moment `pathname` is already the destination's. Bail
  // out then, or the redirect below reads "no Artboard id" as "bare /art" and
  // sends the user back here, cancelling the navigation they asked for.
  const onCanvasRoute = showId ? isCanvasPath(pathname, showId) : false;

  useEffect(() => {
    if (!onCanvasRoute || !workspace.documentsLoaded) return;
    // An artboard is always active, so the URL should name it — landing on the bare /art route
    // leaves the address bar disagreeing with the editor, and un-shareable.
    if (!requestedArtId) {
      if (focused) focusArtboard(focused.artId);
      return;
    }
    if (!focused || (focused.artId !== requestedArtId && focused.canvasId !== requestedArtId)) {
      void navigate({
        to: "/shows/$showId/art",
        params: { showId: params.showId },
        replace: true,
      });
    }
  }, [
    focused,
    focusArtboard,
    navigate,
    onCanvasRoute,
    params.showId,
    requestedArtId,
    workspace.documentsLoaded,
  ]);

  if (showId === null || show.isError || !show.data) {
    return (
      <p className="p-6" role="alert">
        This Show doesn't exist, or isn't yours.
      </p>
    );
  }
  if (show.isPending || workspace.pending) {
    return <p className="p-6 text-muted-foreground">Loading Canvas workspace…</p>;
  }
  return (
    <CanvasWorkspaceEditor
      artboards={workspace.artboards}
      initialCamera={workspace.initialCamera}
      initialSelection={workspace.initialSelection}
      focusedArtId={focused?.artId ?? null}
      session={workspace.session}
      variables={workspace.variables}
      blockVariableEditing={workspace.blockVariableEditing}
      blocks={workspace.blocks}
      cues={workspace.cues}
      actions={workspace.actions}
      eventBindings={workspace.eventBindings}
      shapes={workspace.shapes}
      deviceQrImages={workspace.deviceQrImages}
      imageAssets={workspace.imageAssets}
    />
  );
}

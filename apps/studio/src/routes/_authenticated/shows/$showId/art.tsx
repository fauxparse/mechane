import { isId } from "@mechane/domain";
import type { ShowId } from "@mechane/domain";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { useCanvasWorkspace } from "../../../../api/canvas";
import { useShow } from "../../../../api/shows";
import { CanvasWorkspaceEditor } from "../../../../editors/canvas/CanvasWorkspaceEditor";
import { artIdFromPath, resolveFocusedArtboard } from "../../../../editors/canvas/canvas-workspace";

export const Route = createFileRoute("/_authenticated/shows/$showId/art")({
  component: CanvasWorkspaceRoute,
});

function CanvasWorkspaceRoute() {
  const params = Route.useParams();
  const showId: ShowId | null = isId("show", params.showId) ? params.showId : null;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const show = useShow(showId);
  const workspace = useCanvasWorkspace(showId);
  const requestedArtId = showId ? artIdFromPath(pathname, showId) : null;
  const focused = resolveFocusedArtboard(workspace.data ?? [], requestedArtId);

  useEffect(() => {
    if (!workspace.data || !requestedArtId) return;
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
  if (show.isPending || workspace.isPending) {
    return <p className="p-6 text-muted-foreground">Loading Canvas workspace…</p>;
  }
  if (workspace.isError) {
    return (
      <p className="p-6" role="alert">
        Canvas workspace couldn't be loaded.
      </p>
    );
  }

  return (
    <CanvasWorkspaceEditor
      artboards={workspace.data ?? []}
      focusedArtId={focused?.artId ?? null}
      onFocusArtboard={(artId) =>
        void navigate({
          to: "/shows/$showId/art/$artId",
          params: { showId: params.showId, artId },
          replace: true,
        })
      }
      onBack={() => void navigate({ to: "/shows/$showId", params: { showId: params.showId } })}
    />
  );
}

import { isId } from "@mechane/domain";
import type { ShowId } from "@mechane/domain";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useCanvasWorkspace } from "../../../../api/canvas";
import { useShow } from "../../../../api/shows";
import { useShowGraph, useShowGraphEdits } from "../../../../api/show-graph";
import { CanvasWorkspaceEditor } from "../../../../editors/canvas/CanvasWorkspaceEditor";
import {
  artIdFromPath,
  resolveFocusedArtboard,
} from "../../../../editors/canvas/data/canvas-workspace";
import { useCanvasCommands } from "../../../../editors/canvas/commands/use-canvas-commands";
import { useGraphEditing } from "../../../../editors/show/commands/use-graph-editing";
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
  const lastUndoTarget = useRef<"canvas" | "graph" | null>(null);
  const canvasCommands = useCanvasCommands(workspace.data, (edits) => {
    lastUndoTarget.current = "canvas";
    save.enqueue(edits);
  });
  const graphEditing = useGraphEditing(draft.data, (edits) => {
    lastUndoTarget.current = "graph";
    save.enqueue(edits);
  });
  const undo = useCallback(() => {
    if (lastUndoTarget.current === "graph" && graphEditing.commands.canUndo) {
      graphEditing.commands.undo();
    } else if (lastUndoTarget.current === "canvas" && canvasCommands.canUndo) {
      canvasCommands.undo();
    } else if (graphEditing.commands.canUndo) {
      graphEditing.commands.undo();
    } else {
      canvasCommands.undo();
    }
  }, [canvasCommands, graphEditing.commands]);
  const redo = useCallback(() => {
    if (lastUndoTarget.current === "graph" && graphEditing.commands.canRedo) {
      graphEditing.commands.redo();
    } else if (lastUndoTarget.current === "canvas" && canvasCommands.canRedo) {
      canvasCommands.redo();
    } else if (graphEditing.commands.canRedo) {
      graphEditing.commands.redo();
    } else {
      canvasCommands.redo();
    }
  }, [canvasCommands, graphEditing.commands]);
  useUndoKeys({ undo, redo });
  const artboards = useMemo(() => {
    const current = new Map(
      canvasCommands.workspace.artboards.map((artboard) => [artboard.canvasId, artboard]),
    );
    const names = new Map(graphEditing.graph.nodes.map((node) => [node.id, node.name]));
    return (workspace.data ?? []).map((artboard) => {
      const edited = current.get(artboard.canvasId);
      const name = names.get(artboard.artId) ?? artboard.name;
      return edited
        ? { ...artboard, name, canvas: edited.canvas, position: edited.position }
        : name === artboard.name
          ? artboard
          : { ...artboard, name };
    });
  }, [canvasCommands.workspace.artboards, graphEditing.graph, workspace.data]);

  // An artboard's name belongs to the Scene or Block that owns the Canvas, so a rename is a
  // Show-graph gesture. The graph stack owns the live name and the same save path as every
  // Canvas edit; the undo coordinator above keeps both editor histories in order.
  const renameArtboard = useCallback(
    (artId: string, name: string) => {
      if (!showId) return;
      graphEditing.beginRename(artId);
      graphEditing.renameTo(name);
      graphEditing.commitRename();
    },
    [graphEditing.beginRename, graphEditing.commitRename, graphEditing.renameTo, showId],
  );
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
      onBeginMoveArtboard={canvasCommands.beginArtboardMove}
      onMoveArtboard={canvasCommands.updateArtboardMove}
      onEndMoveArtboard={canvasCommands.endArtboardMove}
      onCreateElement={canvasCommands.createElement}
      onMoveElement={canvasCommands.moveElement}
      onUpdateElement={canvasCommands.updateElement}
      onDeleteElements={canvasCommands.removeElements}
      onRenameArtboard={renameArtboard}
    />
  );
}

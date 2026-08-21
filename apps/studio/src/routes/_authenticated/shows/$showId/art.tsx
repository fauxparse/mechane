import type { ResolvedImageValue } from "@mechane/domain";
import { isId, resolveCanvasProperties } from "@mechane/domain";
import type { ImageInputOnUploadProps } from "@mechane/design-system";
import type { ShowId } from "@mechane/domain";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { resolveApiUrl } from "../../../../api/client";
import { useCanvasWorkspace } from "../../../../api/canvas";
import { useImageAssets, useImageUpload } from "../../../../api/images";
import { useShow } from "../../../../api/shows";
import { useShowGraph, useShowGraphEdits } from "../../../../api/show-graph";
import { CanvasWorkspaceEditor } from "../../../../editors/canvas/CanvasWorkspaceEditor";
import {
  artIdFromPath,
  isCanvasPath,
  resolveFocusedArtboard,
} from "../../../../editors/canvas/data/canvas-workspace";
import {
  rememberedCanvasCamera,
  rememberCanvasCamera,
} from "../../../../editors/canvas/data/canvas-session";
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
  const imageAssets = useImageAssets(showId);
  const imageUpload = useImageUpload(showId);
  const draft = useShowGraph(showId, "draft");
  const workspace = useCanvasWorkspace(showId);
  const initialCamera = showId ? rememberedCanvasCamera(showId) : undefined;
  const onCameraChange = useCallback(
    (camera: Parameters<typeof rememberCanvasCamera>[1]) => {
      if (showId) rememberCanvasCamera(showId, camera);
    },
    [showId],
  );
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
    const nodes = new Map(graphEditing.graph.nodes.map((node) => [node.id, node]));
    return (workspace.data ?? []).map((artboard) => {
      const edited = current.get(artboard.canvasId);
      const name = nodes.get(artboard.artId)?.name ?? artboard.name;
      const canvas = edited?.canvas ?? artboard.canvas;
      const owner = nodes.get(artboard.artId);
      const variables = owner?.kind === "scene" ? owner.variables : [];
      const renderCanvas = resolveCanvasProperties(canvas, {
        graph: graphEditing.graph,
        variables,
        shapes: graphEditing.graph.shapes,
        imageAssets: (imageAssets.data ?? []).map((asset) => ({
          ...asset,
          assetId: asset.id,
        })),
      });
      return {
        ...artboard,
        name,
        canvas,
        renderCanvas,
        position: edited?.position ?? artboard.position,
      };
    });
  }, [canvasCommands.workspace.artboards, graphEditing.graph, imageAssets.data, workspace.data]);

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

  // This route stays mounted for a moment while the router transitions away
  // from it, and during that moment `pathname` is already the destination's. Bail
  // out then, or the redirect below reads "no Artboard id" as "bare /art" and
  // sends the user back here, cancelling the navigation they asked for.
  const onCanvasRoute = showId ? isCanvasPath(pathname, showId) : false;

  useEffect(() => {
    if (!onCanvasRoute || !workspace.data) return;
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
  }, [focused, navigate, onCanvasRoute, params.showId, requestedArtId, workspace.data]);

  const handleImageUpload = useCallback(
    ({ file, signal, onProgress, onSuccess, onError }: ImageInputOnUploadProps) => {
      void imageUpload
        .mutateAsync({ file, signal, onProgress })
        .then((asset) => {
          const resolvedValue = {
            assetId: asset.id,
            revision: asset.revision,
            url: resolveApiUrl(asset.url),
            width: asset.width,
            height: asset.height,
            alt: asset.alt,
            mimeType: asset.mimeType,
            blurHash: asset.blurHash,
          } as ResolvedImageValue & { revision: string };
          onSuccess(resolvedValue);
        })
        .catch((error: unknown) => {
          if (signal.aborted) return;
          onError({
            code: "NETWORK_FAILURE",
            message: error instanceof Error ? error.message : "The image upload failed.",
            cause: error,
          });
        });
    },
    [imageUpload],
  );
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
  const focusedNode = graphEditing.graph.nodes.find((node) => node.id === focused?.artId);
  const focusedVariables = focusedNode?.kind === "scene" ? focusedNode.variables : [];
  return (
    <CanvasWorkspaceEditor
      artboards={artboards}
      initialCamera={initialCamera}
      onCameraChange={onCameraChange}
      focusedArtId={focused?.artId ?? null}
      variables={focusedVariables}
      imageAssets={imageAssets.data ?? []}
      onImageUpload={handleImageUpload}
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
      onMoveElementBetweenCanvases={canvasCommands.moveElementBetweenCanvases}
      onUpdateElement={canvasCommands.updateElement}
      onUpdateElements={canvasCommands.updateElements}
      onDeleteElements={canvasCommands.removeElements}
      onRenameArtboard={renameArtboard}
    />
  );
}

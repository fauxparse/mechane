import {
  DEVICE_SOURCE_HANDLES,
  defaultValueForType,
  deviceQrImageValue,
  generateId,
  isId,
} from "@mechane/domain";
import type { ImageInputOnUploadProps } from "@mechane/design-system";
import type {
  BlockVariable,
  ImageAssetReference,
  ResolvedImageValue,
  ShowId,
  SlotVariableValue,
  Type,
} from "@mechane/domain";
import type { CanvasArtboardDocument } from "../../../../api/canvas";
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
import { useCanvasArtboards } from "../../../../editors/canvas/data/use-canvas-artboards";
import { useBlockCreation } from "../../../../editors/canvas/commands/use-block-creation";
import {
  rememberedCanvasCamera,
  rememberCanvasCamera,
} from "../../../../editors/canvas/data/canvas-session";
import { setBlockVariables } from "@mechane/commands";
import { useCanvasCommands } from "../../../../editors/canvas/commands/use-canvas-commands";
import { UndoCoordinator } from "../../../../editors/canvas/commands/undo-coordinator";
import {
  useGraphEditing,
  type GraphEditing,
} from "../../../../editors/show/commands/use-graph-editing";
import { useUndoKeys } from "../../../../editors/show/keyboard/use-undo-keys";

export const Route = createFileRoute("/_authenticated/shows/$showId/art")({
  component: CanvasWorkspaceRoute,
});

function useBlockVariableEditing(
  focused: CanvasArtboardDocument | null,
  graphEditing: Pick<GraphEditing, "command">,
) {
  return useMemo(() => {
    if (!focused || focused.kind !== "block") return undefined;
    const block = graphEditing.command.graph.blocks?.find(
      (candidate) => candidate.id === focused.artId,
    );
    if (!block) return undefined;
    const updateVariables = (variables: readonly BlockVariable[]) => {
      graphEditing.command.commands.execute(setBlockVariables(block.id, variables));
    };
    return {
      addVariable: () => {
        const type: Type = "text";
        updateVariables([
          ...block.variables,
          {
            id: generateId("variable"),
            name: `variable${block.variables.length + 1}`,
            type,
            required: false,
            defaultValue: defaultValueForType(type, graphEditing.command.graph.shapes ?? []),
          },
        ]);
      },
      renameVariable: (variableId: string, name: string) => {
        updateVariables(
          block.variables.map((variable) =>
            variable.id === variableId ? { ...variable, name } : variable,
          ),
        );
      },
      setVariableType: (variableId: string, type: Type) => {
        updateVariables(
          block.variables.map((variable) =>
            variable.id === variableId
              ? {
                  ...variable,
                  type,
                  defaultValue: defaultValueForType(type, graphEditing.command.graph.shapes ?? []),
                }
              : variable,
          ),
        );
      },
      setVariableDefault: (variableId: string, defaultValue: unknown) => {
        updateVariables(
          block.variables.map((variable) => {
            if (variable.id !== variableId) return variable;
            const next = { ...variable };
            if (defaultValue === null || defaultValue === undefined) delete next.defaultValue;
            else next.defaultValue = defaultValue;
            return next;
          }),
        );
      },
      reorderVariables: (variableIds: readonly string[]) => {
        const byId = new Map(block.variables.map((variable) => [variable.id, variable]));
        updateVariables(
          variableIds.flatMap((variableId) => {
            const variable = byId.get(variableId);
            return variable ? [variable] : [];
          }),
        );
      },
      removeVariable: (variableId: string) => {
        updateVariables(block.variables.filter((variable) => variable.id !== variableId));
      },
    };
  }, [focused, graphEditing]);
}

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
  // Both editors' stacks are live at once here, and one action can reach both — creating a Block
  // moves Elements onto a new Block Canvas and adds the Block itself (#426). The coordinator
  // remembers which stacks each action reached so one Cmd+Z reverses all of it.
  const undoCoordinator = useRef<UndoCoordinator | null>(null);
  undoCoordinator.current ??= new UndoCoordinator();
  const undoHistory = undoCoordinator.current;
  const canvasCommands = useCanvasCommands(workspace.data, (edits) => {
    undoHistory.record("canvas");
    save.enqueue(edits);
  });
  const graphEditing = useGraphEditing(draft.data, (edits) => {
    undoHistory.record("graph");
    save.enqueue(edits);
  });
  const undoStacks = useMemo(
    () => ({ graph: graphEditing.command.commands, canvas: canvasCommands }),
    [canvasCommands, graphEditing.command.commands],
  );
  const undo = useCallback(() => undoHistory.undo(undoStacks), [undoHistory, undoStacks]);
  const redo = useCallback(() => undoHistory.redo(undoStacks), [undoHistory, undoStacks]);
  useUndoKeys({ undo, redo });
  const { artboards, blocks } = useCanvasArtboards({
    documents: workspace.data,
    workspace: canvasCommands.workspace,
    graph: graphEditing.command.graph,
    imageAssets: imageAssets.data ?? [],
  });

  // An artboard's name belongs to the Scene or Block that owns the Canvas, so a rename is a
  // Show-graph gesture. The graph stack owns the live name and the same save path as every
  // Canvas edit; the undo coordinator above keeps both editor histories in order.
  const renameArtboard = useCallback(
    (artId: string, name: string) => {
      if (!showId) return;
      graphEditing.gestures.beginRename(artId);
      graphEditing.gestures.renameTo(name);
      graphEditing.gestures.commitRename();
    },
    [
      graphEditing.gestures.beginRename,
      graphEditing.gestures.commitRename,
      graphEditing.gestures.renameTo,
      showId,
    ],
  );
  const requestedArtId = showId ? artIdFromPath(pathname, showId) : null;
  const focused = resolveFocusedArtboard(artboards, requestedArtId);

  const placeBlock = useCallback(
    (blockId: string) => {
      if (!focused) return;
      const parentId = focused.canvas.root.id;
      const rank = String(focused.canvas.root.children?.length ?? 0);
      canvasCommands.createElement(
        focused.canvasId,
        { id: generateId("canvas"), type: "slot", blockId },
        parentId,
        rank,
      );
    },
    [canvasCommands.createElement, focused],
  );

  const createBlock = useBlockCreation({
    artboards,
    canvasCommands,
    graph: graphEditing.command.graph,
    executeGraphCommand: graphEditing.command.commands.execute,
    undoHistory,
  });

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
  const deviceQrImages = useMemo(() => {
    const images: Record<string, ResolvedImageValue & Pick<ImageAssetReference, "revision">> = {};
    const nodesById = new Map(graphEditing.command.graph.nodes.map((node) => [node.id, node]));
    for (const edge of graphEditing.command.graph.edges) {
      if (edge.kind !== "wiring" || edge.sourcePath[0] !== DEVICE_SOURCE_HANDLES.qrCode) continue;
      const variableId = edge.targetPath[0];
      const device = nodesById.get(edge.sourceId);
      if (!variableId || device?.kind !== "device" || !device.pairingCode) continue;
      images[variableId] = deviceQrImageValue(device.id, device.pairingCode);
    }
    return images;
  }, [graphEditing.command.graph]);
  const blockVariableEditing = useBlockVariableEditing(focused, graphEditing);
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
  const focusedNode = graphEditing.command.graph.nodes.find((node) => node.id === focused?.artId);
  const focusedBlock = graphEditing.command.graph.blocks?.find(
    (block) => block.id === focused?.artId,
  );
  const focusedVariables =
    focusedNode?.kind === "scene"
      ? focusedNode.variables
      : (focusedBlock?.variables.map(({ id, name, type, defaultValue }) => ({
          id,
          name,
          type,
          defaultValue,
        })) ?? []);
  return (
    <CanvasWorkspaceEditor
      artboards={artboards}
      initialCamera={initialCamera}
      focusedArtId={focused?.artId ?? null}
      onCameraChange={onCameraChange}
      variables={focusedVariables}
      blockVariableEditing={blockVariableEditing}
      blocks={blocks}
      onPlaceBlock={placeBlock}
      onCreateBlockFromSelection={createBlock}
      shapes={graphEditing.command.graph.shapes ?? []}
      deviceQrImages={deviceQrImages}
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

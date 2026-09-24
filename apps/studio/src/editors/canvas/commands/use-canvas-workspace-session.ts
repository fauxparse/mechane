// The Canvas editor's session (issue #745): everything it means to *edit* a
// Show's Canvas workspace, in one hook.
//
// The route used to compose this by hand — the Canvas and Show-graph command
// stacks, the undo coordinator that keeps one gesture one undo across both,
// the save path they both reach, upload normalization, and the derivations the
// editor paints from (Artboards, device QR images, variables). That
// composition is a Canvas concern, not a routing one, so it lives here: the
// route hands over the Show, the Artboard the URL names, and two navigation
// adapters, and gets back the session the editor calls plus the view data it
// renders.
//
// Focused-Artboard navigation stays a route adapter passed in — this module
// knows the router exists only through `focusArtboard` and `focusCue`.

import {
  addCue,
  addEventBinding,
  composite,
  removeEventBinding,
  setBlockVariables,
  setEventBindingCue,
  setEventBindingKey,
  setEventBindingOrder,
} from "@mechane/commands";
import type { ImageInputOnUploadProps } from "@mechane/design-system";
import type { Block, BlockVariable } from "@mechane/domain/blocks";
import { deviceQrImageValue } from "@mechane/domain/device-qr";
import { normalizeFormulaIdentifier } from "@mechane/domain/formula";
import { DEVICE_SOURCE_HANDLES } from "@mechane/domain/graph";
import type { SceneVariable } from "@mechane/domain/graph";
import { type ShowId, generateId } from "@mechane/domain/id";
import type { Action, Cue, EventBinding, InteractionOwner } from "@mechane/domain/interactions";
import type { ResolvedImageValue, Shape, Type } from "@mechane/domain/shapes";
import { defaultValueForType } from "@mechane/domain/source-defaults";
import type { ImageAsset } from "@mechane/graphql-schema";
import { useCallback, useMemo, useRef } from "react";

import { resolveApiUrl } from "../../../api/client";
import type { CanvasArtboardDocument } from "../../../api/canvas";
import { useCanvasWorkspace } from "../../../api/canvas";
import { useImageAssets, useImageUpload } from "../../../api/images";
import { useShowGraph, useShowGraphEdits } from "../../../api/show-graph";
import type { VariableInspectorEditing } from "../../../components/VariableInspector";
import { useGraphEditing, type GraphEditing } from "../../show/commands/use-graph-editing";
import { useOpenedShowGraph } from "../../show/data/use-opened-graph";
import { useUndoKeys } from "../../show/keyboard/use-undo-keys";
import type { CanvasCamera } from "../components/canvas-camera";
import type { CanvasWorkspaceSession, DeviceQrImage } from "../canvas-workspace-types";
import { rememberCanvasCamera, rememberedCanvasCamera } from "../data/canvas-session";
import { resolveFocusedArtboard } from "../data/canvas-workspace";
import { useCanvasArtboards } from "../data/use-canvas-artboards";
import { UndoCoordinator } from "./undo-coordinator";
import { useBlockCreationSession } from "./use-block-creation";
import { useCanvasCommands } from "./use-canvas-commands";

export interface CanvasWorkspaceSessionOptions {
  readonly showId: ShowId | null;
  /** The Artboard (or Canvas) the URL names, already parsed by the route. */
  readonly requestedArtId: string | null;
  /** Route navigation adapter: make `artId` the focused Artboard in the URL. */
  focusArtboard(artId: string): void;
  /** Route navigation adapter: leave Canvas for the Show editor's Cue. */
  focusCue(cueId: string): void;
}

/** The session the editor calls, and the view-only data it renders with. */
export interface CanvasWorkspaceSessionState {
  readonly session: CanvasWorkspaceSession;
  readonly artboards: readonly CanvasArtboardDocument[];
  /** The Blocks the editor can place, one per Block Artboard. */
  readonly blocks: readonly Block[];
  /** The Artboard `requestedArtId` resolves to; the route redirects on it. */
  readonly focused: CanvasArtboardDocument | null;
  readonly variables: readonly SceneVariable[];
  readonly blockVariableEditing: VariableInspectorEditing | undefined;
  readonly cues: readonly Cue[];
  readonly actions: readonly Action[];
  readonly eventBindings: readonly EventBinding[];
  readonly shapes: readonly Shape[];
  readonly deviceQrImages: Readonly<Record<string, DeviceQrImage>>;
  readonly imageAssets: readonly ImageAsset[];
  readonly initialCamera: CanvasCamera | undefined;
  /** True until the workspace and graph documents have both been read. */
  readonly pending: boolean;
  /** True once the persisted Artboards have been read; the route's redirect gate. */
  readonly documentsLoaded: boolean;
}

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
            variable.id === variableId
              ? { ...variable, name: normalizeFormulaIdentifier(name) }
              : variable,
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

/**
 * Composes the Canvas workspace's editing session: the Canvas and Show-graph
 * command stacks, their shared undo history and save path, Block creation,
 * cross-stack deletion, uploads, camera persistence, and the derivations the
 * editor paints from.
 */
export function useCanvasWorkspaceSession({
  showId,
  requestedArtId,
  focusArtboard,
  focusCue,
}: CanvasWorkspaceSessionOptions): CanvasWorkspaceSessionState {
  const imageAssets = useImageAssets(showId);
  const imageUpload = useImageUpload(showId);
  const draft = useShowGraph(showId, "draft");
  const documents = useCanvasWorkspace(showId);
  const initialCamera = showId ? rememberedCanvasCamera(showId) : undefined;
  const onCameraChange = useCallback(
    (camera: CanvasCamera) => {
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
  const canvasCommands = useCanvasCommands(documents.data, (edits) => {
    undoHistory.record("canvas");
    save.enqueue(edits);
  });
  const openedGraph = useOpenedShowGraph(draft.data);
  const graphEditing = useGraphEditing(openedGraph, (edits) => {
    undoHistory.record("graph");
    save.enqueue(edits);
  });
  const createCue = useCallback(
    (owner: InteractionOwner) => {
      const id = generateId("cue");
      graphEditing.command.commands.execute(
        addCue({
          id,
          name: "New cue",
          owner,
          actionIds: [],
        }),
      );
      return id;
    },
    [graphEditing.command.commands],
  );
  const createBinding = useCallback(
    (binding: EventBinding) => {
      graphEditing.command.commands.execute(addEventBinding(binding));
    },
    [graphEditing.command.commands],
  );
  const changeBindingCue = useCallback(
    (bindingId: string, cueId: string) => {
      graphEditing.command.commands.execute(setEventBindingCue(bindingId, cueId));
    },
    [graphEditing.command.commands],
  );
  const changeBindingKey = useCallback(
    (bindingId: string, key: string | null) => {
      graphEditing.command.commands.execute(setEventBindingKey(bindingId, key));
    },
    [graphEditing.command.commands],
  );
  const removeBinding = useCallback(
    (bindingId: string) => {
      graphEditing.command.commands.execute(removeEventBinding(bindingId));
    },
    [graphEditing.command.commands],
  );
  const reorderBindings = useCallback(
    (bindingIds: readonly string[]) => {
      graphEditing.command.commands.execute(setEventBindingOrder(bindingIds));
    },
    [graphEditing.command.commands],
  );
  const removeElements = useCallback(
    (canvasId: string, elementIds: readonly string[]) => {
      const selectedElementIds = new Set(elementIds);
      const bindingIds: string[] = [];
      for (const binding of graphEditing.command.graph.eventBindings ?? []) {
        if (binding.canvasId === canvasId && selectedElementIds.has(binding.elementId)) {
          bindingIds.push(binding.id);
        }
      }
      undoHistory.link(() => {
        if (bindingIds.length > 0) {
          graphEditing.command.commands.execute(
            composite({
              label: "Remove Element interactions",
              commands: bindingIds.map((bindingId) => removeEventBinding(bindingId)),
            }),
          );
        }
        canvasCommands.removeElements(canvasId, elementIds);
      });
    },
    [canvasCommands, graphEditing.command.commands, graphEditing.command.graph, undoHistory],
  );
  const undoStacks = useMemo(
    () => ({ graph: graphEditing.command.commands, canvas: canvasCommands }),
    [canvasCommands, graphEditing.command.commands],
  );
  const undo = useCallback(() => undoHistory.undo(undoStacks), [undoHistory, undoStacks]);
  const redo = useCallback(() => undoHistory.redo(undoStacks), [undoHistory, undoStacks]);
  useUndoKeys({ undo, redo });
  const { artboards, blocks } = useCanvasArtboards({
    documents: documents.data,
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

  const blockCreation = useBlockCreationSession({
    artboards,
    canvasCommands,
    graph: graphEditing.command.graph,
    executeGraphCommand: graphEditing.command.commands.execute,
    undoHistory,
  });

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
    const images: Record<string, DeviceQrImage> = {};
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
  const focusedNode = graphEditing.command.graph.nodes.find((node) => node.id === focused?.artId);
  const focusedBlock = graphEditing.command.graph.blocks?.find(
    (block) => block.id === focused?.artId,
  );
  const variables: readonly SceneVariable[] =
    focusedNode?.kind === "scene"
      ? focusedNode.variables
      : (focusedBlock?.variables.map(({ id, name, type, defaultValue }) => ({
          id,
          name,
          type,
          defaultValue,
        })) ?? []);
  const session: CanvasWorkspaceSession = {
    canvas: {
      focusArtboard,
      beginMoveArtboard: canvasCommands.beginArtboardMove,
      moveArtboard: canvasCommands.updateArtboardMove,
      endMoveArtboard: canvasCommands.endArtboardMove,
      createElement: canvasCommands.createElement,
      moveElement: canvasCommands.moveElement,
      moveElementBetweenCanvases: canvasCommands.moveElementBetweenCanvases,
      updateElement: canvasCommands.updateElement,
      updateElements: canvasCommands.updateElements,
      placeBlock,
      createBlockFromDrag: blockCreation.fromDrag,
      createBlockFromSelection: blockCreation.fromSelection,
      deleteElements: removeElements,
      renameArtboard,
    },
    graph: {
      createCue,
      focusCue,
      setEventBindingCue: changeBindingCue,
      setEventBindingKey: changeBindingKey,
      createEventBinding: createBinding,
      removeEventBinding: removeBinding,
      reorderEventBindings: reorderBindings,
    },
    assets: { imageUpload: handleImageUpload },
    camera: { change: onCameraChange },
  };
  return {
    session,
    artboards,
    blocks,
    focused,
    variables,
    blockVariableEditing,
    cues: graphEditing.command.graph.cues ?? [],
    actions: graphEditing.command.graph.actions ?? [],
    eventBindings: graphEditing.command.graph.eventBindings ?? [],
    shapes: graphEditing.command.graph.shapes ?? [],
    deviceQrImages,
    imageAssets: imageAssets.data ?? [],
    initialCamera,
    pending: documents.isPending || draft.isPending,
    documentsLoaded: documents.data !== undefined,
  };
}

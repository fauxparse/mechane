import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToastManager } from "@mechane/design-system";
import { canvasElementParent, findCanvasElement } from "@mechane/commands";
import type { FrameElement } from "@mechane/domain";

import type { CanvasArtboardDocument } from "../../api/canvas";
import { EditorSlot } from "../../components/EditorLayout/editor-slots";
import { useEditableArea } from "../../components/EditorLayout/editable-area";
import { logicalRootSize, useCanvasGeometry } from "./components/canvas-geometry";
import type { CanvasSelection } from "./components/canvas-selection";
import { normalizeSelection } from "./components/canvas-selection";
import { useCanvasCamera } from "./components/use-canvas-camera";
import { CanvasWorkspaceStage } from "./components/CanvasWorkspaceStage";
import type {
  CanvasLiveElementGeometry,
  CanvasStageIntent,
} from "./components/CanvasWorkspaceStage";
import { CanvasWorkspaceEditorCommands } from "./components/CanvasWorkspaceEditorCommands";
import { CanvasInspector } from "./components/CanvasInspector/CanvasInspector";
import { CanvasLayers } from "./components/CanvasLayers";
import { Toolbar } from "./Toolbar/Toolbar";
import { artboardLabel, canvasArtboardSize } from "./data/canvas-workspace";
import { arrangeIntentFor, arrangeWithinParent } from "./commands/canvas-arrange";
import type { ArrangeIntent } from "./commands/canvas-arrange";
import { useGoogleFonts } from "./google-fonts-provider";
import { collectFontFamilies, fontFamilyKey, loadGoogleFont } from "./google-fonts";
import type { CanvasCreationTool } from "./commands/canvas-creation";
import type {
  CanvasArtboardDimensions,
  CanvasBlockCreationResult,
  CanvasWorkspaceEditorProps,
} from "./canvas-workspace-types";
import { focusContext } from "../show/keyboard/focus-context";

export type { CanvasWorkspaceEditorProps } from "./canvas-workspace-types";

// react-doctor-disable-next-line no-giant-component
export function CanvasWorkspaceEditor({
  artboards,
  focusedArtId,
  onFocusArtboard,
  onBeginMoveArtboard,
  onMoveArtboard,
  onEndMoveArtboard,
  selectedArtId,
  selectedElementIds,
  onSelectionChange,
  onCreateElement,
  onMoveElement,
  onMoveElementBetweenCanvases,
  onUpdateElement,
  onUpdateElements,
  variables,
  shapes,
  blocks,
  blockVariableEditing,
  onPlaceBlock,
  onCreateBlockFromDrag,
  onCreateBlockFromSelection,
  onImageUpload,
  imageAssets,
  deviceQrImages,
  onDeleteElements,
  onRenameArtboard,
  initialCamera,
  onCameraChange,
}: CanvasWorkspaceEditorProps) {
  const toastManager = useToastManager();
  const ordered = useMemo(
    () =>
      [...artboards].sort(
        (left, right) =>
          left.kind.localeCompare(right.kind) ||
          artboardLabel(left).localeCompare(artboardLabel(right)) ||
          left.artId.localeCompare(right.artId),
      ),
    [artboards],
  );
  const [tool, setTool] = useState<CanvasCreationTool>("select");
  const [renamingArtId, setRenamingArtId] = useState<string | null>(null);
  const [localSelection, setLocalSelection] = useState<CanvasSelection>({
    artId: null,
    elementIds: [],
  });
  const [inspectorPreview, setInspectorPreview] = useState<CanvasLiveElementGeometry | null>(null);
  const focused = ordered.find((artboard) => artboard.artId === focusedArtId) ?? ordered[0] ?? null;
  const selection = useMemo(
    () =>
      selectedArtId === undefined
        ? localSelection
        : normalizeSelection({ artId: selectedArtId, elementIds: selectedElementIds ?? [] }),
    [localSelection, selectedArtId, selectedElementIds],
  );
  const editableArea = useEditableArea();
  const viewport = useCanvasCamera(
    initialCamera,
    selection.artId !== null && selection.elementIds.length > 0,
    onCameraChange,
  );
  const { camera, workspaceRef, frameRect, zoomIn, zoomOut, resetCamera } = viewport;
  const geometryKey = useMemo(() => [camera, ordered] as const, [camera, ordered]);
  const geometrySnapshot = useCanvasGeometry(workspaceRef, geometryKey, camera.zoom);
  const geometry = geometrySnapshot.geometry;
  const artboardSizes = useMemo(() => {
    const sizes = new Map<string, CanvasArtboardDimensions>();
    for (const artboard of ordered) {
      const rootRect = geometry.get(artboard.artId)?.elements.get(artboard.canvas.root.id);
      sizes.set(
        artboard.artId,
        canvasArtboardSize(
          artboard,
          rootRect ? logicalRootSize(rootRect, geometrySnapshot.measuredZoom) : undefined,
        ),
      );
    }
    return sizes;
  }, [geometry, geometrySnapshot.measuredZoom, ordered]);
  const setSelection = useCallback(
    (next: CanvasSelection) => {
      const normalized = normalizeSelection(next);
      setLocalSelection(normalized);
      setInspectorPreview(null);
      onSelectionChange?.(normalized);
    },
    [onSelectionChange],
  );
  const frameArtboard = useCallback(
    (artboard: CanvasArtboardDocument) => {
      const size = artboardSizes.get(artboard.artId) ?? canvasArtboardSize(artboard);
      frameRect(
        { x: artboard.position.x, y: artboard.position.y, width: size.width, height: size.height },
        editableArea,
      );
    },
    [artboardSizes, editableArea, frameRect],
  );
  const frameSelection = useCallback(
    (next: CanvasSelection) => {
      const artboard = next.artId
        ? ordered.find((candidate) => candidate.artId === next.artId)
        : undefined;
      if (artboard) frameArtboard(artboard);
    },
    [frameArtboard, ordered],
  );
  const frameCreatedBlock = useCallback(
    (created: CanvasBlockCreationResult) => {
      frameRect(
        {
          x: created.position.x,
          y: created.position.y,
          width: created.width,
          height: created.height,
        },
        editableArea,
      );
    },
    [editableArea, frameRect],
  );

  const applyCanvasStageIntent = useCallback(
    (intent: CanvasStageIntent): void => {
      switch (intent.kind) {
        case "select":
          setSelection(intent.selection);
          return;
        case "focus": {
          const artboard = ordered.find((candidate) => candidate.artId === intent.artId);
          if (intent.frameBlock && artboard?.kind === "block") frameArtboard(artboard);
          onFocusArtboard(intent.artId);
          return;
        }
        case "artboard-move":
          if (intent.phase === "begin") onBeginMoveArtboard(intent.canvasId);
          else if (intent.phase === "move") onMoveArtboard(intent.canvasId, intent.position);
          else onEndMoveArtboard(intent.canvasId, intent.cancel);
          return;
        case "element-drop":
          if (intent.plan.kind === "move")
            onMoveElement?.(
              intent.plan.canvasId,
              intent.plan.elementId,
              intent.plan.parentId,
              intent.plan.rank,
              intent.plan.properties,
              intent.plan.unsetProperties,
            );
          else if (intent.plan.kind === "move-between-canvases") {
            onMoveElementBetweenCanvases?.(
              intent.plan.sourceCanvasId,
              intent.plan.targetCanvasId,
              intent.plan.elementId,
              intent.plan.parentId,
              intent.plan.rank,
              intent.plan.properties,
              intent.plan.unsetProperties,
            );
            setSelection(intent.plan.select);
            if (intent.plan.select.artId) onFocusArtboard(intent.plan.select.artId);
          } else if (intent.plan.kind === "update")
            onUpdateElement?.(intent.plan.canvasId, intent.plan.elementId, intent.plan.properties);
          return;
        case "resize":
          for (const update of intent.updates)
            onUpdateElement?.(
              intent.canvasId,
              update.elementId,
              update.properties,
              update.unsetProperties,
            );
          return;
        case "create-element":
          onCreateElement?.(intent.canvasId, intent.element, intent.parentId, intent.rank);
          setSelection({ artId: intent.artId, elementIds: [intent.element.id] });
          onFocusArtboard(intent.artId);
          setTool("select");
          return;
        case "create-block": {
          const created = onCreateBlockFromDrag?.(intent.request);
          if (created) {
            setSelection({ artId: created.canvasId, elementIds: [] });
            frameCreatedBlock(created);
            onFocusArtboard(created.canvasId);
          }
          setTool("select");
          return;
        }
        case "creation-missed-canvas":
          toastManager.add({
            title: "Can't create Element",
            description: "The drawn shape does not intersect a Canvas.",
            type: "error",
          });
          setTool("select");
          return;
        case "cancel-creation":
          setTool("select");
          return;
        case "update-element":
          onUpdateElement?.(
            intent.canvasId,
            intent.elementId,
            intent.properties,
            intent.unsetProperties,
          );
          return;
        case "move-element":
          onMoveElement?.(intent.canvasId, intent.elementId, intent.parentId, intent.rank);
          return;
        case "rename-artboard":
          onRenameArtboard?.(intent.artId, intent.name);
          return;
        default: {
          const _exhaustive: never = intent;
          return _exhaustive;
        }
      }
    },
    [
      frameArtboard,
      frameCreatedBlock,
      onBeginMoveArtboard,
      onCreateBlockFromDrag,
      onCreateElement,
      onEndMoveArtboard,
      onFocusArtboard,
      onMoveArtboard,
      onMoveElement,
      onMoveElementBetweenCanvases,
      onRenameArtboard,
      onUpdateElement,
      ordered,
      setSelection,
      toastManager,
    ],
  );

  const deleteSelection = useCallback(() => {
    if (
      focusContext().inKeyConsumingWidget ||
      !selection.artId ||
      selection.elementIds.length === 0
    )
      return false;
    const artboard = ordered.find((candidate) => candidate.artId === selection.artId);
    if (!artboard) return false;
    const removable = selection.elementIds.filter((id) => id !== artboard.canvas.root.id);
    if (removable.length === 0) return false;
    onDeleteElements?.(artboard.canvasId, removable);
    setSelection({ artId: artboard.artId, elementIds: [] });
    return true;
  }, [onDeleteElements, ordered, selection, setSelection]);
  const arrangeSelection = useCallback(
    (intent: ArrangeIntent) => {
      if (
        focusContext().inKeyConsumingWidget ||
        !selection.artId ||
        selection.elementIds.length === 0
      )
        return false;
      const artboard = ordered.find((candidate) => candidate.artId === selection.artId);
      if (!artboard) return false;
      const byParent = new Map<string, string[]>();
      for (const elementId of selection.elementIds) {
        const parentInfo = canvasElementParent(artboard.canvas.root, elementId);
        if (parentInfo)
          byParent.set(parentInfo.parentId, [
            ...(byParent.get(parentInfo.parentId) ?? []),
            elementId,
          ]);
      }
      let moved = false;
      for (const [parentId, elementIds] of byParent) {
        const parent = findCanvasElement(artboard.canvas.root, parentId);
        if (!parent || parent.type !== "frame") continue;
        for (const move of arrangeWithinParent(parent as FrameElement, elementIds, intent)) {
          onMoveElement?.(artboard.canvasId, move.elementId, move.parentId, move.rank);
          moved = true;
        }
      }
      return moved;
    },
    [onMoveElement, ordered, selection],
  );
  const arrangeSelectionRef = useRef(arrangeSelection);
  const deleteSelectionRef = useRef(deleteSelection);
  useEffect(() => {
    arrangeSelectionRef.current = arrangeSelection;
    deleteSelectionRef.current = deleteSelection;
  });
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const intent = arrangeIntentFor(event);
      if (intent && arrangeSelectionRef.current(intent)) event.preventDefault();
      if ((event.key === "Backspace" || event.key === "Delete") && deleteSelectionRef.current())
        event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const fontFamilies = useMemo(() => collectFontFamilies(ordered), [ordered]);
  const googleFontsQuery = useGoogleFonts();
  const googleFontKeys = useMemo(
    () => new Set((googleFontsQuery.data ?? []).map((font) => fontFamilyKey(font.family))),
    [googleFontsQuery.data],
  );
  useEffect(() => {
    for (const family of fontFamilies)
      if (googleFontKeys.has(fontFamilyKey(family))) loadGoogleFont(family);
  }, [fontFamilies, googleFontKeys]);
  const selectedGeometry = selection.artId ? geometry.get(selection.artId) : undefined;
  const previewElementId =
    selection.elementIds.length === 1 ? selection.elementIds[0] : selectedGeometry?.rootElementId;
  const currentDimensions =
    selectedGeometry && previewElementId
      ? (() => {
          const current = selectedGeometry.elements.get(previewElementId);
          return current
            ? {
                elementId: previewElementId,
                width: Math.round(current.width / camera.zoom),
                height: Math.round(current.height / camera.zoom),
              }
            : null;
        })()
      : null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <CanvasWorkspaceStage
        ordered={ordered}
        focused={focused}
        artboardSizes={artboardSizes}
        viewport={viewport}
        geometrySnapshot={geometrySnapshot}
        selection={selection}
        tool={tool}
        renamingArtId={renamingArtId}
        onRenamingArtIdChange={setRenamingArtId}
        onIntent={applyCanvasStageIntent}
        onLiveElementGeometry={setInspectorPreview}
      />
      <EditorSlot name="left">
        <CanvasLayers
          ordered={ordered}
          focused={focused}
          onFrameSelection={frameSelection}
          onFocusArtboard={(artId) =>
            applyCanvasStageIntent({ kind: "focus", artId, frameBlock: false })
          }
          selection={selection}
          onSelect={setSelection}
          onUpdateElement={onUpdateElement}
          onMoveElement={onMoveElement}
          onMoveElementBetweenCanvases={onMoveElementBetweenCanvases}
          onRenameArtboard={onRenameArtboard}
        />
      </EditorSlot>
      <EditorSlot name="right">
        <CanvasInspector
          focused={focused}
          artboards={ordered}
          selection={selection}
          blocks={blocks}
          variables={variables}
          shapes={shapes}
          blockVariableEditing={blockVariableEditing}
          deviceQrImages={deviceQrImages}
          imageAssets={imageAssets}
          onImageUpload={onImageUpload}
          inspectorPreview={inspectorPreview}
          currentDimensions={currentDimensions}
          onUpdateElement={onUpdateElement}
          onRenameArtboard={onRenameArtboard}
          onUpdateElements={onUpdateElements}
        />
      </EditorSlot>
      <EditorSlot name="toolbar">
        <Toolbar
          tool={tool}
          onToolChange={setTool}
          zoom={camera.zoom}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetView={resetCamera}
        />
      </EditorSlot>
      <CanvasWorkspaceEditorCommands
        ordered={ordered}
        focused={focused}
        selection={selection}
        setTool={setTool}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        resetCamera={resetCamera}
        setRenamingArtId={setRenamingArtId}
        onFocusArtboard={onFocusArtboard}
        blocks={blocks}
        onPlaceBlock={onPlaceBlock}
        onCreateBlockFromSelection={onCreateBlockFromSelection}
        onDeleteElements={onDeleteElements}
        frameCreatedBlock={frameCreatedBlock}
        setSelection={setSelection}
      />
    </div>
  );
}

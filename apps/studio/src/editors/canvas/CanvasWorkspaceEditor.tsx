import { useCallback, useEffect, useMemo, useState } from "react";

import { CommandPalette } from "../show/commands/CommandPalette";
import type { PaletteCommand } from "../show/commands/palette-commands";
import { useEditorKeys } from "../show/keyboard/use-editor-keys";
import { focusContext } from "../show/keyboard/focus-context";

import type { CanvasWorkspaceEditorProps } from "./canvas-workspace-types";
export type { CanvasWorkspaceEditorProps } from "./canvas-workspace-types";
import { CanvasWorkspaceSurface } from "./components/CanvasWorkspaceSurface";
import { useCanvasWorkspaceInteractions } from "./use-canvas-workspace-interactions";
import { canvasToolFor } from "./keyboard/canvas-keyboard";

/** The public Canvas editor surface; interaction state lives in its dedicated hook. */
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
  imageAssets,
  deviceQrImages,
  onImageUpload,
  onDeleteElements,
  onRenameArtboard,
  initialCamera,
  onCameraChange,
}: CanvasWorkspaceEditorProps) {
  const {
    ordered,
    focused,
    camera,
    workspaceRef,
    selection,
    tool,
    setTool,
    renamingArtId,
    setRenamingArtId,
    drag,
    dragLine,
    rubberbandRect,
    creationOverlayRect,
    overlayRect,
    resizePreview,
    resizeCursor,
    inspectorPreview,
    currentDimensions,
    resizable,
    cancelCreation,
    zoomIn,
    zoomOut,
    resetCamera,
    frameArtboard,
    setSelection,
    beginDrag,
    moveDrag,
    endDrag,
    beginElementDrag,
    updateElementDrag,
    finishElementDrag,
    beginRubberband,
    updateRubberband,
    endRubberband,
    beginWorkspaceInteraction,
    moveWorkspaceInteraction,
    endWorkspaceInteraction,
    cancelWorkspaceInteraction,
    beginCreation,
    moveCreation,
    finishCreation,
    selectAtPoint,
    beginResize,
    handleCanvasKeyDown,
  } = useCanvasWorkspaceInteractions({
    artboards,
    focusedArtId,
    onFocusArtboard,
    onBeginMoveArtboard,
    onMoveArtboard,
    onEndMoveArtboard,
    selectedArtId,
    selectedElementIds,
    onSelectionChange,
    onCameraChange,
    initialCamera,
    onCreateElement,
    onMoveElement,
    onMoveElementBetweenCanvases,
    onUpdateElement,
    onDeleteElements,
    onRenameArtboard,
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const deleteSelection = useCallback(() => {
    const artboard = ordered.find((candidate) => candidate.artId === selection.artId);
    if (artboard && selection.elementIds.length > 0) {
      onDeleteElements?.(artboard.canvasId, selection.elementIds);
    }
  }, [onDeleteElements, ordered, selection.artId, selection.elementIds]);
  const selectAll = useCallback(() => {
    if (!focused) return;
    const ids = (focused.canvas.root.children ?? []).flatMap((element) => [
      element.id,
      ...(element.children ?? []).map((child) => child.id),
    ]);
    setSelection({ artId: focused.artId, elementIds: ids });
  }, [focused, setSelection]);
  const paletteCommands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: "create-rectangle",
        label: "Create Rectangle",
        scope: "canvas",
        run: () => setTool("rect"),
      },
      {
        id: "create-ellipse",
        label: "Create Ellipse",
        scope: "canvas",
        run: () => setTool("ellipse"),
      },
      { id: "create-text", label: "Create Text", scope: "canvas", run: () => setTool("text") },
      { id: "create-image", label: "Create Image", scope: "canvas", run: () => setTool("image") },
      { id: "create-frame", label: "Create Frame", scope: "canvas", run: () => setTool("frame") },
      { id: "zoom-in", label: "Zoom In", scope: "canvas", run: zoomIn },
      { id: "zoom-out", label: "Zoom Out", scope: "canvas", run: zoomOut },
      { id: "reset-view", label: "Reset View", scope: "canvas", run: resetCamera },
      {
        id: "delete-selection",
        label: "Delete Selection",
        scope: "selection",
        disabledReason: selection.elementIds.length === 0 ? "select an Element first" : undefined,
        run: deleteSelection,
      },
    ],
    [deleteSelection, resetCamera, selection.elementIds.length, setTool, zoomIn, zoomOut],
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const nextTool = canvasToolFor(event, focusContext());
      if (!nextTool) return;
      event.preventDefault();
      setTool(nextTool);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTool]);
  useEditorKeys(
    useMemo(
      () => ({
        "open-palette": () => setPaletteOpen(true),
        "delete-selection": deleteSelection,
        rename: () => setRenamingArtId(selection.artId),
        "select-all": selectAll,
        "fit-graph": resetCamera,
        "zoom-to-selection": resetCamera,
        deselect: () => setSelection({ artId: null, elementIds: [] }),
      }),
      [
        deleteSelection,
        focused,
        resetCamera,
        selection.artId,
        selectAll,
        setRenamingArtId,
        setSelection,
      ],
    ),
  );

  return (
    <>
      <CanvasWorkspaceSurface
        ordered={ordered}
        focused={focused}
        camera={camera}
        workspaceRef={workspaceRef}
        selection={selection}
        tool={tool}
        setTool={setTool}
        onCancelCreation={cancelCreation}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        resetCamera={resetCamera}
        frameArtboard={frameArtboard}
        renamingArtId={renamingArtId}
        setRenamingArtId={setRenamingArtId}
        drag={drag}
        dragLine={dragLine}
        rubberbandRect={rubberbandRect}
        creationOverlayRect={creationOverlayRect}
        resizePreview={resizePreview}
        resizeCursor={resizeCursor}
        inspectorPreview={inspectorPreview}
        currentDimensions={currentDimensions}
        overlayRect={overlayRect}
        resizable={resizable}
        onFocusArtboard={onFocusArtboard}
        onUpdateElement={onUpdateElement}
        onUpdateElements={onUpdateElements}
        variables={variables}
        imageAssets={imageAssets}
        deviceQrImages={deviceQrImages}
        onImageUpload={onImageUpload}
        onMoveElement={onMoveElement}
        onMoveElementBetweenCanvases={onMoveElementBetweenCanvases}
        onRenameArtboard={onRenameArtboard}
        onSelect={setSelection}
        onBeginDrag={beginDrag}
        onMoveDrag={moveDrag}
        onEndDrag={endDrag}
        onBeginElementDrag={beginElementDrag}
        onUpdateElementDrag={updateElementDrag}
        onFinishElementDrag={finishElementDrag}
        onBeginRubberband={beginRubberband}
        onUpdateRubberband={updateRubberband}
        onEndRubberband={endRubberband}
        onBeginWorkspaceInteraction={beginWorkspaceInteraction}
        onMoveWorkspaceInteraction={moveWorkspaceInteraction}
        onEndWorkspaceInteraction={endWorkspaceInteraction}
        onCancelWorkspaceInteraction={cancelWorkspaceInteraction}
        onBeginCreation={beginCreation}
        onMoveCreation={moveCreation}
        onFinishCreation={finishCreation}
        onSelectAtPoint={selectAtPoint}
        onBeginResize={beginResize}
        onHandleCanvasKeyDown={handleCanvasKeyDown}
      />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={paletteCommands} />
    </>
  );
}

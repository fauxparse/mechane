import { useCallback } from "react";

import type { CanvasWorkspaceEditorProps } from "./canvas-workspace-types";
export type { CanvasWorkspaceEditorProps } from "./canvas-workspace-types";
import { CanvasWorkspaceEditorCommands } from "./components/CanvasWorkspaceEditorCommands";
import { CanvasWorkspaceSurface } from "./components/CanvasWorkspaceSurface";
import { useCanvasWorkspaceInteractions } from "./use-canvas-workspace-interactions";

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
    artboardSizes,
    resizable,
    cancelCreation,
    zoomIn,
    zoomOut,
    resetCamera,
    frameArtboard,
    frameSelection,
    frameCreatedBlock,
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
    onCreateBlockFromDrag,
    onMoveElement,
    onMoveElementBetweenCanvases,
    onUpdateElement,
    onDeleteElements,
    onRenameArtboard,
  });
  const focusArtboard = useCallback(
    (artId: string) => {
      const artboard = ordered.find((candidate) => candidate.artId === artId);
      if (artboard?.kind === "block") frameArtboard(artboard);
      onFocusArtboard(artId);
    },
    [frameArtboard, onFocusArtboard, ordered],
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
        frameSelection={frameSelection}
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
        artboardSizes={artboardSizes}
        overlayRect={overlayRect}
        resizable={resizable}
        onFocusArtboard={focusArtboard}
        onUpdateElement={onUpdateElement}
        variables={variables}
        shapes={shapes}
        blocks={blocks}
        blockVariableEditing={blockVariableEditing}
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
    </>
  );
}

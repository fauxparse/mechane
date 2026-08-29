// The Canvas editor's surface. It owns the infinite plane and nothing else:
// the Layers panel, the Inspector, and the toolbar are contributed to the
// Editor Chrome's slots, which is what puts them in the same sidebars the Show
// Editor uses and lets one trigger collapse them together.
//
// The stage fills its container, and the container is the whole viewport — the
// plane runs underneath the sidebars to the edges of the screen. Anything that
// frames content should consult `useEditableArea()` rather than the stage size.
import { useEffect, useMemo } from "react";
import { EditorSlot } from "../../../components/EditorLayout/editor-slots";

import { collectFontFamilies, fontFamilyKey, loadGoogleFont } from "../google-fonts";
import { useGoogleFonts } from "../google-fonts-provider";
import type { CanvasWorkspaceSurfaceProps } from "../canvas-workspace-types";
import { Toolbar } from "../Toolbar/Toolbar";
import { CanvasWorkspaceStage } from "./CanvasWorkspaceStage";
import { CanvasInspector } from "./CanvasInspector/CanvasInspector";
import { CanvasLayers } from "./CanvasLayers";

export function CanvasWorkspaceSurface({
  onCancelCreation,
  zoomIn,
  zoomOut,
  resetCamera,
  frameSelection,
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
  onFocusArtboard,
  onUpdateElement,
  onUpdateElements,
  onMoveElement,
  variables,
  shapes,
  blocks,
  blockVariableEditing,
  imageAssets,
  deviceQrImages,
  onImageUpload,
  onMoveElementBetweenCanvases,
  onRenameArtboard,
  onSelect,
  onBeginDrag,
  onMoveDrag,
  onEndDrag,
  onBeginElementDrag,
  onUpdateElementDrag,
  onFinishElementDrag,
  onBeginRubberband,
  onUpdateRubberband,
  onEndRubberband,
  onBeginWorkspaceInteraction,
  onMoveWorkspaceInteraction,
  onEndWorkspaceInteraction,
  onCancelWorkspaceInteraction,
  onBeginCreation,
  onMoveCreation,
  onFinishCreation,
  onSelectAtPoint,
  onBeginResize,

  onHandleCanvasKeyDown,
}: CanvasWorkspaceSurfaceProps) {
  const fontFamilies = useMemo(() => collectFontFamilies(ordered), [ordered]);
  const googleFontsQuery = useGoogleFonts();
  const googleFontKeys = useMemo(
    () => new Set((googleFontsQuery.data ?? []).map((font) => fontFamilyKey(font.family))),
    [googleFontsQuery.data],
  );

  useEffect(() => {
    for (const fontFamily of fontFamilies) {
      if (googleFontKeys.has(fontFamilyKey(fontFamily))) loadGoogleFont(fontFamily);
    }
  }, [fontFamilies, googleFontKeys]);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <CanvasWorkspaceStage
        workspaceRef={workspaceRef}
        onCancelCreation={onCancelCreation}
        onHandleCanvasKeyDown={onHandleCanvasKeyDown}
        onBeginWorkspaceInteraction={onBeginWorkspaceInteraction}
        onMoveWorkspaceInteraction={onMoveWorkspaceInteraction}
        onEndWorkspaceInteraction={onEndWorkspaceInteraction}
        onCancelWorkspaceInteraction={onCancelWorkspaceInteraction}
        tool={tool}
        setTool={setTool}
        camera={camera}
        ordered={ordered}
        artboardSizes={artboardSizes}
        shapes={shapes}
        blocks={blocks}
        drag={drag}
        focused={focused}
        onBeginCreation={onBeginCreation}
        onFocusArtboard={onFocusArtboard}
        onSelect={onSelect}
        onBeginRubberband={onBeginRubberband}
        onBeginElementDrag={onBeginElementDrag}
        onSelectAtPoint={onSelectAtPoint}
        onBeginDrag={onBeginDrag}
        onUpdateElement={onUpdateElement}
        onUpdateElementDrag={onUpdateElementDrag}
        onUpdateRubberband={onUpdateRubberband}
        onMoveDrag={onMoveDrag}
        onMoveCreation={onMoveCreation}
        onFinishElementDrag={onFinishElementDrag}
        onEndRubberband={onEndRubberband}
        onEndDrag={onEndDrag}
        onFinishCreation={onFinishCreation}
        renamingArtId={renamingArtId}
        setRenamingArtId={setRenamingArtId}
        onRenameArtboard={onRenameArtboard}
        overlayRect={overlayRect}
        resizePreview={resizePreview}
        resizeCursor={resizeCursor}
        resizable={resizable}
        onBeginResize={onBeginResize}
        creationOverlayRect={creationOverlayRect}
        dragLine={dragLine}
        rubberbandRect={rubberbandRect}
      />

      <EditorSlot name="left">
        <CanvasLayers
          ordered={ordered}
          focused={focused}
          onFrameSelection={frameSelection}
          onFocusArtboard={onFocusArtboard}
          selection={selection}
          onSelect={onSelect}
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
    </div>
  );
}

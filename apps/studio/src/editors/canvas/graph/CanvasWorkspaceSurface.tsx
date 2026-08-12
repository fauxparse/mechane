// The Canvas editor's surface. It owns the infinite plane and nothing else:
// the Layers panel, the Inspector, and the toolbar are contributed to the
// Editor Chrome's slots, which is what puts them in the same sidebars the Show
// Editor uses and lets one trigger collapse them together.
//
// The stage fills its container, and the container is the whole viewport — the
// plane runs underneath the sidebars to the edges of the screen. Anything that
// frames content should consult `useEditableArea()` rather than the stage size.
import { EditorPanel } from "../../../components/EditorLayout/EditorLayout";
import { EditorSlot } from "../../../components/EditorLayout/editor-slots";
import type { CanvasWorkspaceSurfaceProps } from "../canvas-workspace-types";
import { Toolbar } from "../Toolbar/Toolbar";
import { CanvasWorkspaceStage } from "./CanvasWorkspaceStage";
import { CanvasInspector } from "./CanvasInspector";
import { CanvasLayers } from "./CanvasLayers";

export function CanvasWorkspaceSurface({
  onCancelCreation,
  zoomIn,
  zoomOut,
  resetCamera,
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
  resizable,
  onFocusArtboard,
  onUpdateElement,
  onUpdateElements,
  variables,
  onMoveElement,
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
        drag={drag}
        focused={focused}
        onBeginCreation={onBeginCreation}
        onFocusArtboard={onFocusArtboard}
        onSelect={onSelect}
        onBeginRubberband={onBeginRubberband}
        onBeginElementDrag={onBeginElementDrag}
        onSelectAtPoint={onSelectAtPoint}
        onBeginDrag={onBeginDrag}
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
        <EditorPanel title="Properties">
          <CanvasInspector
            focused={focused}
            selection={selection}
            variables={variables}
            onUpdateElement={onUpdateElement}
            onUpdateElements={onUpdateElements}
          />
        </EditorPanel>
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

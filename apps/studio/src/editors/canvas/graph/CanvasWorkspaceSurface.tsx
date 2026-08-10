import { Layers3, Minus, PanelLeft, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";

import {
  Button,
  Sidebar,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@mechane/design-system";

import type { CanvasWorkspaceSurfaceProps } from "../canvas-workspace-types";
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
  layersOpen,
  setLayersOpen,
  inspectorOpen,
  setInspectorOpen,
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
  resizable,
  onFocusArtboard,
  onUpdateElement,
  onMoveElement,
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
      <div className="flex min-h-0 min-w-0 flex-1">
        <SidebarProvider open={layersOpen} onOpenChange={setLayersOpen} className="h-full shrink-0">
          <Sidebar aria-label="Canvas layers">
            <SidebarHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <Layers3 aria-hidden="true" className="size-4 shrink-0" />
                  <strong className="truncate group-data-[state=collapsed]/sidebar:hidden">
                    Layers
                  </strong>
                </div>
                <SidebarTrigger aria-label="Toggle layers">
                  <PanelLeft aria-hidden="true" />
                </SidebarTrigger>
              </div>
            </SidebarHeader>
            <CanvasLayers
              ordered={ordered}
              focused={focused}
              selection={selection}
              onFocusArtboard={onFocusArtboard}
              onSelect={onSelect}
              onUpdateElement={onUpdateElement}
              onMoveElement={onMoveElement}
              onRenameArtboard={onRenameArtboard}
            />
          </Sidebar>
        </SidebarProvider>

        <SidebarProvider
          open={inspectorOpen}
          onOpenChange={setInspectorOpen}
          className="h-full min-w-0 flex-1"
        >
          <SidebarInset>
            <div className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={layersOpen ? "Collapse layers" : "Expand layers"}
                aria-expanded={layersOpen}
                onClick={() => setLayersOpen((open) => !open)}
              >
                <PanelLeft aria-hidden="true" />
              </Button>
              <div className="flex min-w-0 flex-col gap-0.5">
                <strong className="truncate text-sm">Canvas workspace</strong>
                <span className="text-xs text-muted-foreground">
                  {ordered.length} artboard{ordered.length === 1 ? "" : "s"}
                </span>
              </div>
              <SidebarTrigger aria-label="Toggle inspector">
                <SlidersHorizontal aria-hidden="true" />
              </SidebarTrigger>
            </div>

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
              resizable={resizable}
              onBeginResize={onBeginResize}
              creationOverlayRect={creationOverlayRect}
              dragLine={dragLine}
              rubberbandRect={rubberbandRect}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
              <div
                className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-lg backdrop-blur"
                role="toolbar"
                aria-label="Canvas view controls"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Zoom out"
                  onClick={zoomOut}
                >
                  <Minus aria-hidden="true" />
                </Button>
                <span className="min-w-12 px-1 text-center text-xs tabular-nums" aria-live="polite">
                  {Math.round(camera.zoom * 100)}%
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Zoom in"
                  onClick={zoomIn}
                >
                  <Plus aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Reset view"
                  onClick={resetCamera}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </div>
            </div>
          </SidebarInset>

          <Sidebar side="right" aria-label="Canvas inspector">
            <SidebarHeader>
              <div className="flex items-center gap-2 text-sm">
                <SlidersHorizontal aria-hidden="true" className="size-4" />
                <strong>Inspector</strong>
              </div>
            </SidebarHeader>
            <CanvasInspector
              focused={focused}
              selection={selection}
              onUpdateElement={onUpdateElement}
            />
          </Sidebar>
        </SidebarProvider>
      </div>
    </div>
  );
}

import { Box, Layers3, Minus, PanelLeft, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { PointerEvent } from "react";
import { useMemo, useState } from "react";

import {
  Button,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@mechane/design-system";
import type { Position } from "@mechane/domain";
import { CanvasRenderer } from "@mechane/rendering";

import type { CanvasArtboardDocument } from "../../api/canvas";
import { canvasArtboardSize } from "./canvas-workspace";
import type { CanvasCamera } from "./canvas-camera";
import { useCanvasCamera } from "./use-canvas-camera";

export interface CanvasWorkspaceEditorProps {
  artboards: readonly CanvasArtboardDocument[];
  focusedArtId: string | null;
  onFocusArtboard(artId: string): void;
  onBeginMoveArtboard(canvasId: string): void;
  onMoveArtboard(canvasId: string, position: Position): void;
  onEndMoveArtboard(canvasId: string, cancel?: boolean): void;
  initialCamera?: CanvasCamera;
  initialLayersOpen?: boolean;
  initialInspectorOpen?: boolean;
}

function artboardLabel(artboard: CanvasArtboardDocument): string {
  return (
    artboard.name.trim() || `${artboard.kind === "scene" ? "Scene" : "Block"} ${artboard.artId}`
  );
}

type DragState = {
  artId: string;
  canvasId: string;
  pointerId: number;
  origin: Position;
  start: Position;
};

export function CanvasWorkspaceEditor({
  artboards,
  focusedArtId,
  onFocusArtboard,
  onBeginMoveArtboard,
  onMoveArtboard,
  onEndMoveArtboard,
  initialCamera,
  initialLayersOpen,
  initialInspectorOpen,
}: CanvasWorkspaceEditorProps) {
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
  const [layersOpen, setLayersOpen] = useState(initialLayersOpen ?? true);
  const [inspectorOpen, setInspectorOpen] = useState(initialInspectorOpen ?? true);
  const [drag, setDrag] = useState<DragState | null>(null);
  const focused = ordered.find((artboard) => artboard.artId === focusedArtId) ?? ordered[0] ?? null;
  const {
    camera,
    workspaceRef,
    beginCameraDrag,
    moveCameraDrag,
    endCameraDrag,
    handleWheel,
    zoomIn,
    zoomOut,
    resetCamera,
  } = useCanvasCamera(initialCamera);

  const beginDrag = (event: PointerEvent<HTMLDivElement>, artboard: CanvasArtboardDocument) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      artId: artboard.artId,
      canvasId: artboard.canvasId,
      pointerId: event.pointerId,
      origin: { ...artboard.position },
      start: { x: event.clientX, y: event.clientY },
    });
    onBeginMoveArtboard(artboard.canvasId);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>, artboard: CanvasArtboardDocument) => {
    if (!drag || drag.artId !== artboard.artId || drag.pointerId !== event.pointerId) return;
    onMoveArtboard(artboard.canvasId, {
      x: drag.origin.x + (event.clientX - drag.start.x) / camera.zoom,
      y: drag.origin.y + (event.clientY - drag.start.y) / camera.zoom,
    });
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>, cancel = false) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onEndMoveArtboard(drag.canvasId, cancel);
    setDrag(null);
  };

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
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Artboards</SidebarGroupLabel>
                <SidebarGroupContent>
                  {ordered.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground group-data-[state=collapsed]/sidebar:hidden">
                      No artboards yet.
                    </p>
                  ) : (
                    <SidebarMenu>
                      {ordered.map((artboard) => (
                        <SidebarMenuItem key={artboard.artId}>
                          <SidebarMenuButton
                            aria-label={artboardLabel(artboard)}
                            isActive={artboard.artId === focused?.artId}
                            data-artboard-id={artboard.artId}
                            onClick={() => onFocusArtboard(artboard.artId)}
                          >
                            <Box aria-hidden="true" />
                            <span className="truncate group-data-[state=collapsed]/sidebar:hidden">
                              {artboardLabel(artboard)}
                            </span>
                            <small className="ml-auto text-xs text-muted-foreground group-data-[state=collapsed]/sidebar:hidden">
                              {artboard.kind === "scene" ? "Scene" : "Block"}
                            </small>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
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

            <main
              ref={workspaceRef}
              className="relative min-h-0 flex-1 overflow-hidden bg-muted/20 outline-none"
              aria-label="Canvas workspace"
              tabIndex={0}
              onPointerDown={beginCameraDrag}
              onPointerMove={moveCameraDrag}
              onPointerUp={endCameraDrag}
              onPointerCancel={endCameraDrag}
              onWheel={handleWheel}
            >
              <div
                className="pointer-events-none absolute top-0 left-0 h-0 w-0"
                style={{
                  transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
                  transformOrigin: "0 0",
                }}
              >
                {ordered.map((artboard) => {
                  const size = canvasArtboardSize(artboard);
                  return (
                    <section
                      key={artboard.artId}
                      className="pointer-events-auto absolute cursor-pointer rounded-lg border border-border bg-background shadow-xl data-[focused=true]:border-primary data-[focused=true]:ring-2 data-[focused=true]:ring-primary/35"
                      data-artboard-id={artboard.artId}
                      data-owner-kind={artboard.kind}
                      data-focused={artboard.artId === focused?.artId ? "true" : "false"}
                      style={{
                        left: artboard.position.x,
                        top: artboard.position.y,
                        width: size.width,
                      }}
                      aria-label={artboardLabel(artboard)}
                      onClick={() => onFocusArtboard(artboard.artId)}
                    >
                      <div
                        className={`flex h-10 items-center justify-between gap-2 border-b border-border px-3 text-xs ${
                          drag?.artId === artboard.artId ? "cursor-grabbing" : "cursor-grab"
                        }`}
                        onPointerDown={(event) => beginDrag(event, artboard)}
                        onPointerMove={(event) => moveDrag(event, artboard)}
                        onPointerUp={endDrag}
                        onPointerCancel={(event) => endDrag(event, true)}
                      >
                        <span className="truncate">{artboardLabel(artboard)}</span>
                        <small className="shrink-0 text-[0.6875rem] uppercase text-muted-foreground">
                          {artboard.kind}
                        </small>
                      </div>
                      <div
                        className="overflow-hidden"
                        style={{ width: size.width, height: size.height }}
                      >
                        <CanvasRenderer canvas={artboard.canvas} />
                      </div>
                    </section>
                  );
                })}
              </div>
            </main>
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
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Selection</SidebarGroupLabel>
                <SidebarGroupContent>
                  {focused ? (
                    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted p-3 text-xs">
                      <strong>{artboardLabel(focused)}</strong>
                      <span className="text-muted-foreground">
                        {focused.kind === "scene" ? "Scene" : "Block"} artboard
                      </span>
                      <span className="text-muted-foreground">
                        Position {focused.position.x}, {focused.position.y}
                      </span>
                    </div>
                  ) : (
                    <p className="p-2 text-sm text-muted-foreground">Select an artboard.</p>
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
        </SidebarProvider>
      </div>
    </div>
  );
}

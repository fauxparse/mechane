import { Puzzle, TvMinimal } from "@mechane/design-system";

import { CanvasRenderer } from "@mechane/rendering";

import { canvasArtboardSize, artboardLabel } from "../data/canvas-workspace";
import {
  handleCursor,
  handlePosition,
  isCornerHandle,
  RESIZE_HANDLES,
} from "../commands/canvas-resize";
import { creationPreviewShape } from "../commands/canvas-creation";
import type { CanvasWorkspaceSurfaceProps } from "../canvas-workspace-types";
import { useCanvasTextEditing } from "./use-canvas-text-editing";

const HANDLE_SIZE = 8;

type CanvasWorkspaceStageProps = Pick<
  CanvasWorkspaceSurfaceProps,
  | "workspaceRef"
  | "onCancelCreation"
  | "onHandleCanvasKeyDown"
  | "onBeginWorkspaceInteraction"
  | "onMoveWorkspaceInteraction"
  | "onEndWorkspaceInteraction"
  | "onCancelWorkspaceInteraction"
  | "tool"
  | "setTool"
  | "camera"
  | "ordered"
  | "drag"
  | "focused"
  | "onBeginCreation"
  | "onFocusArtboard"
  | "onSelect"
  | "onBeginRubberband"
  | "onBeginElementDrag"
  | "onSelectAtPoint"
  | "onUpdateElementDrag"
  | "onUpdateRubberband"
  | "onBeginDrag"
  | "onUpdateElement"
  | "onMoveDrag"
  | "onMoveCreation"
  | "onFinishElementDrag"
  | "onEndRubberband"
  | "onEndDrag"
  | "onFinishCreation"
  | "renamingArtId"
  | "setRenamingArtId"
  | "onRenameArtboard"
  | "overlayRect"
  | "resizePreview"
  | "resizeCursor"
  | "resizable"
  | "onBeginResize"
  | "creationOverlayRect"
  | "dragLine"
  | "rubberbandRect"
>;

// The stage keeps pointer handlers and their overlay ordering in one event surface.
// react-doctor-disable-next-line no-giant-component
export function CanvasWorkspaceStage({
  workspaceRef,
  onCancelCreation,
  onHandleCanvasKeyDown,
  onBeginWorkspaceInteraction,
  onMoveWorkspaceInteraction,
  onEndWorkspaceInteraction,
  onCancelWorkspaceInteraction,
  tool,
  camera,
  ordered,
  drag,
  focused,
  onBeginCreation,
  onFocusArtboard,
  onSelect,
  onBeginRubberband,
  onBeginElementDrag,
  onSelectAtPoint,
  onUpdateElementDrag,
  onBeginDrag,
  onUpdateElement,
  onUpdateRubberband,
  onMoveDrag,
  onMoveCreation,
  onFinishElementDrag,
  onEndRubberband,
  onEndDrag,
  onFinishCreation,
  renamingArtId,
  setRenamingArtId,
  onRenameArtboard,
  overlayRect,
  resizePreview,
  resizeCursor,
  resizable,
  onBeginResize,
  creationOverlayRect,
  dragLine,
  rubberbandRect,
}: CanvasWorkspaceStageProps) {
  const { textEdit, textEditRef, beginTextEdit, commitTextEdit, handleTextKeyDown } =
    useCanvasTextEditing({ ordered, workspaceRef, onUpdateElement });
  const creationPreview = creationOverlayRect
    ? creationPreviewShape(tool, creationOverlayRect)
    : null;
  return (
    <main
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
      ref={workspaceRef}
      style={{
        cursor: resizeCursor ?? (tool !== "select" ? "crosshair" : undefined),
        touchAction: "none",
      }}
      aria-label="Canvas workspace"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onCancelCreation();
        }
        onHandleCanvasKeyDown(event);
      }}
      onPointerDown={(event) => {
        commitTextEdit();
        if (tool !== "select") onBeginCreation(event, null);
        onBeginWorkspaceInteraction(event);
      }}
      onPointerMove={onMoveWorkspaceInteraction}
      onPointerUp={onEndWorkspaceInteraction}
      onPointerCancel={onCancelWorkspaceInteraction}
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
          const preview = resizePreview?.artId === artboard.artId ? resizePreview : null;
          return (
            <div
              key={artboard.artId}
              role="group"
              className={`pointer-events-auto absolute overflow-hidden bg-background shadow-2xl ${
                drag?.artId === artboard.artId ? "cursor-grabbing" : "cursor-default"
              }`}
              data-artboard-id={artboard.artId}
              data-canvas-id={artboard.canvasId}
              data-artboard-kind={artboard.kind}
              data-owner-kind={artboard.kind}
              data-focused={artboard.artId === focused?.artId ? "true" : "false"}
              style={{
                left: preview?.x ?? artboard.position.x,
                top: preview?.y ?? artboard.position.y,
                width: preview?.width ?? size.width,
                height: preview?.height ?? size.height,
                cursor:
                  resizeCursor ??
                  (tool !== "select"
                    ? "crosshair"
                    : drag?.artId === artboard.artId
                      ? "grabbing"
                      : "default"),
                // An outline sits outside the box, so the border never eats into the
                // Canvas, and it stays 1px on screen however far the camera is zoomed.
                outline: "1px solid var(--border)",
                outlineOffset: 0,
              }}
              onPointerDown={(event) => {
                const textTarget =
                  event.target instanceof HTMLElement
                    ? event.target.closest<HTMLElement>("[data-element-type='text']")
                    : null;
                if (textEditRef.current) {
                  if (textTarget?.dataset.elementId === textEditRef.current.elementId) {
                    event.stopPropagation();
                    return;
                  }
                  commitTextEdit();
                }
                if (event.detail > 1 && textTarget) {
                  event.stopPropagation();
                  return;
                }
                if (tool !== "select") {
                  onBeginCreation(event, artboard);
                  return;
                }
                // The body being a drag handle costs the band its usual start, so Cmd
                // (Ctrl elsewhere) asks for a band instead — over Elements too, which is
                // the point of banding inside an artboard.
                if (event.metaKey || event.ctrlKey) {
                  event.stopPropagation();
                  onFocusArtboard(artboard.artId);
                  onSelect({ artId: artboard.artId, elementIds: [] });
                  onBeginRubberband(event, artboard.artId);
                  return;
                }
                if (onBeginElementDrag(event, artboard)) return;
                // Empty Canvas is the Canvas itself: pressing it selects the artboard and
                // grabs it, so the body is a drag handle wherever no Element is in the way.
                onSelectAtPoint(event, artboard);
                onBeginDrag(event, artboard);
              }}
              onDoubleClick={(event) => {
                const textElement =
                  (event.target instanceof HTMLElement
                    ? event.target.closest<HTMLElement>("[data-element-type='text']")
                    : null) ??
                  event.currentTarget.ownerDocument
                    .elementFromPoint(event.clientX, event.clientY)
                    ?.closest<HTMLElement>("[data-element-type='text']");
                if (
                  textElement?.closest<HTMLElement>("[data-artboard-id]") !== event.currentTarget
                ) {
                  return;
                }
                const elementId = textElement?.dataset.elementId;
                if (elementId) beginTextEdit(elementId, event);
              }}
              onPointerMove={(event) => {
                onUpdateElementDrag(event);
                onUpdateRubberband(event);
                onMoveDrag(event, artboard);
                onMoveCreation(event);
              }}
              onPointerUp={(event) => {
                onFinishElementDrag(event);
                onEndRubberband(event);
                onEndDrag(event);
                onFinishCreation(event);
              }}
              onPointerCancel={(event) => {
                onFinishElementDrag(event, true);
                onEndRubberband(event);
                onEndDrag(event, true);
                onFinishCreation(event, true);
              }}
            >
              <CanvasRenderer
                canvas={artboard.renderCanvas ?? artboard.canvas}
                editingElementId={textEdit?.artId === artboard.artId ? textEdit.elementId : null}
                onTextDoubleClick={beginTextEdit}
                onTextKeyDown={handleTextKeyDown}
              />
            </div>
          );
        })}
      </div>
      {/* Names live outside the camera's scale so they stay legible at any zoom, the way
                  every design tool does it. Their positions are the camera transform done by hand. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {ordered.map((artboard) => {
          const active = artboard.artId === focused?.artId;
          const Icon = artboard.kind === "scene" ? TvMinimal : Puzzle;
          return (
            <div
              key={artboard.artId}
              className="pointer-events-auto absolute flex -translate-y-full items-center gap-1.5 pb-1 text-xs whitespace-nowrap"
              style={{
                left: camera.x + artboard.position.x * camera.zoom,
                top: camera.y + artboard.position.y * camera.zoom,
              }}
              data-artboard-label={artboard.artId}
            >
              <Icon
                aria-hidden="true"
                className={`size-3.5 shrink-0 ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              />
              {renamingArtId === artboard.artId ? (
                <input
                  autoFocus
                  defaultValue={artboard.name}
                  aria-label={`Rename ${artboardLabel(artboard)}`}
                  className="w-40 rounded-sm border border-border bg-background px-1 text-xs outline-none focus:ring-2 focus:ring-ring"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") {
                      // Reset first, so the blur below has nothing to commit.
                      event.currentTarget.value = artboard.name;
                      event.currentTarget.blur();
                    }
                  }}
                  onBlur={(event) => {
                    const name = event.currentTarget.value.trim();
                    if (name && name !== artboard.name) {
                      onRenameArtboard?.(artboard.artId, name);
                    }
                    setRenamingArtId(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={`cursor-grab truncate active:cursor-grabbing ${
                    active ? "font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                  onPointerDown={(event) => onBeginDrag(event, artboard)}
                  onPointerMove={(event) => onMoveDrag(event, artboard)}
                  onPointerUp={(event) => onEndDrag(event)}
                  onPointerCancel={(event) => onEndDrag(event, true)}
                  onClick={() => {
                    onFocusArtboard(artboard.artId);
                    onSelect({ artId: artboard.artId, elementIds: [] });
                  }}
                  onDoubleClick={() => setRenamingArtId(artboard.artId)}
                >
                  {artboardLabel(artboard)}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        style={{ color: "var(--muted-foreground)" }}
        aria-hidden="true"
        data-selection-overlay
      >
        {overlayRect ? (
          <>
            <rect
              x={overlayRect.x}
              y={overlayRect.y}
              width={overlayRect.width}
              height={overlayRect.height}
              fill="none"
              stroke="currentColor"
              strokeDasharray="6 4"
              strokeWidth="1"
              data-selection-rect
              vectorEffect="non-scaling-stroke"
            />
            {resizable &&
              RESIZE_HANDLES.map((handle) => {
                const at = handlePosition(handle);
                const x = overlayRect.x + overlayRect.width * at.x;
                const y = overlayRect.y + overlayRect.height * at.y;
                return (
                  <rect
                    key={handle}
                    x={x - HANDLE_SIZE / 2}
                    y={y - HANDLE_SIZE / 2}
                    width={HANDLE_SIZE}
                    height={HANDLE_SIZE}
                    rx={isCornerHandle(handle) ? 1 : HANDLE_SIZE / 2}
                    fill="white"
                    stroke="currentColor"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                    style={{ pointerEvents: "auto", cursor: handleCursor(handle) }}
                    data-resize-handle={handle}
                    onPointerDown={(event) => onBeginResize(event, handle)}
                  />
                );
              })}
          </>
        ) : null}
        {creationPreview?.type === "ellipse" ? (
          <ellipse
            cx={creationPreview.cx}
            cy={creationPreview.cy}
            rx={creationPreview.rx}
            ry={creationPreview.ry}
            fill="none"
            stroke="currentColor"
            strokeDasharray="6 4"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            data-creation-preview
          />
        ) : creationPreview ? (
          <rect
            x={creationPreview.x}
            y={creationPreview.y}
            width={creationPreview.width}
            height={creationPreview.height}
            fill="none"
            stroke="currentColor"
            strokeDasharray="6 4"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            data-creation-preview
          />
        ) : null}
        {dragLine ? (
          <rect
            x={dragLine.x}
            y={dragLine.y}
            width={dragLine.width}
            height={dragLine.height}
            fill="none"
            stroke="var(--primary)"
            strokeDasharray="4 3"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            data-drag-insertion
          />
        ) : null}
        {rubberbandRect ? (
          <rect
            x={rubberbandRect.x}
            y={rubberbandRect.y}
            width={rubberbandRect.width}
            height={rubberbandRect.height}
            fill="none"
            stroke="currentColor"
            strokeDasharray="6 4"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            data-rubberband
          />
        ) : null}
      </svg>
    </main>
  );
}

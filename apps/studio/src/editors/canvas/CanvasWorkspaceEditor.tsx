import { Box, Layers3, Minus, PanelLeft, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

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
import type { NewElement } from "@mechane/commands";

import type { CanvasArtboardDocument } from "../../api/canvas";
import { canvasArtboardSize } from "./canvas-workspace";
import type { CanvasCamera } from "./canvas-camera";
import { useCanvasCamera } from "./use-canvas-camera";
import { useCanvasGeometry } from "./canvas-geometry";
import {
  containedSelection,
  normalizeSelection,
  rectsOverlap,
  selectionRect,
  toggleSelection,
  topmostPaintedElementAtPoint,
} from "./canvas-selection";
import type { CanvasSelection } from "./canvas-selection";
import { containingFrame, rankForInsertion } from "./canvas-creation";
import type { CanvasCreationTool } from "./canvas-creation";
import { canvasElementParent, findCanvasElement } from "@mechane/commands";
import type { CanvasClientRect } from "./canvas-geometry";
import type { Element as CanvasElement, FrameElement } from "@mechane/domain";
import { canvasKeyboardIntent, nudgeAnchor } from "./canvas-keyboard";
import { focusContext } from "../show/keyboard/focus-context";

import { flattenCanvasLayers, layerChildren, layerMatches } from "./canvas-layers";
import { layerDropPlacement, layerDropZone } from "./canvas-layer-drop";
import type { LayerDropZone } from "./canvas-layer-drop";
import {
  handleCursor,
  handlePosition,
  isCornerHandle,
  lockedAspectRatio,
  resizeBox,
  RESIZE_HANDLES,
} from "./canvas-resize";
import type { ResizeBox, ResizeHandle } from "./canvas-resize";
import { CanvasInspector } from "./CanvasInspector";
export interface CanvasWorkspaceEditorProps {
  artboards: readonly CanvasArtboardDocument[];
  focusedArtId: string | null;
  onFocusArtboard(artId: string): void;
  onBeginMoveArtboard(canvasId: string): void;
  onMoveArtboard(canvasId: string, position: Position): void;
  onEndMoveArtboard(canvasId: string, cancel?: boolean): void;
  selectedArtId?: string | null;
  selectedElementIds?: readonly string[];
  onSelectionChange?(selection: CanvasSelection): void;
  initialCamera?: CanvasCamera;
  onCreateElement?(canvasId: string, element: NewElement, parentId: string, rank: string): void;
  onMoveElement?(
    canvasId: string,
    elementId: string,
    parentId: string,
    rank: string,
    properties?: Record<string, unknown>,
    unsetProperties?: readonly string[],
  ): void;
  onUpdateElement?(
    canvasId: string,
    elementId: string,
    properties: Record<string, unknown>,
    unsetProperties?: readonly string[],
  ): void;
  initialLayersOpen?: boolean;
  initialInspectorOpen?: boolean;
}
function measuredRect(element: HTMLElement): CanvasClientRect {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
  };
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

type RubberbandState = {
  pointerId: number;
  start: { x: number; y: number };
  current: { x: number; y: number };
  /**
   * The artboard the band started on, when it started on one. Artboards overlap, so the artboard
   * under a point is ambiguous — only the element that received the pointerdown knows which one
   * the director actually hit. Null means the band started on empty workspace.
   */
  artId: string | null;
};
type CreationDraft = {
  tool: Exclude<CanvasCreationTool, "select">;
  artId: string;
  pointerId: number;
  start: { x: number; y: number };
  current: { x: number; y: number };
};
type ElementDragState = {
  artId: string;
  canvasId: string;
  elementId: string;
  pointerId: number;
  start: { x: number; y: number };
  origin: { x: number; y: number };
  originParentId: string | null;
  originRank: string | null;
};
/** Big enough to grab at any zoom, small enough not to swamp a small Element. */
const HANDLE_SIZE = 8;

type ResizeGesture = {
  artId: string;
  canvasId: string;
  elementId: string;
  handle: ResizeHandle;
  pointerId: number;
  pointerStart: { x: number; y: number };
  /** Screen-space box the Element occupied when the handle was grabbed. */
  start: ResizeBox;
  /** Screen-space box of the parent, so an absolute anchor can be expressed relative to it. */
  parent: ResizeBox | null;
  ratio: number | null;
  autoParent: boolean;
};

function zoneFor(event: React.DragEvent<HTMLElement>, isFrame: boolean): LayerDropZone {
  const rect = event.currentTarget.getBoundingClientRect();
  return layerDropZone(event.clientY - rect.top, rect.height, isFrame);
}

function CanvasLayers({
  ordered,
  focused,
  selection,
  onFocusArtboard,
  onSelect,
  onUpdateElement,
  onMoveElement,
}: {
  ordered: readonly CanvasArtboardDocument[];
  focused: CanvasArtboardDocument | null;
  selection: CanvasSelection;
  onFocusArtboard(artId: string): void;
  onSelect(selection: CanvasSelection): void;
  onUpdateElement?(canvasId: string, elementId: string, properties: Record<string, unknown>): void;
  onMoveElement?(canvasId: string, elementId: string, parentId: string, rank: string): void;
}) {
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ id: string; zone: LayerDropZone } | null>(null);

  const applyDrop = (targetId: string, zone: LayerDropZone) => {
    setDropHint(null);
    const draggedId = dragging;
    setDragging(null);
    if (!draggedId || !focused) return;
    const placement = layerDropPlacement(focused.canvas.root, draggedId, targetId, zone);
    if (!placement) return;
    onMoveElement?.(focused.canvasId, draggedId, placement.parentId, placement.rank);
  };

  const renderTree = (element: CanvasElement, depth: number): React.ReactNode => {
    const active = selection.artId === focused?.artId && selection.elementIds.includes(element.id);
    const isRoot = element.id === focused?.canvas.root.id;
    const hint = dropHint?.id === element.id ? dropHint.zone : null;
    return (
      <div key={element.id}>
        <SidebarMenuButton
          className={`h-8 ${
            hint === "inside"
              ? "ring-2 ring-inset ring-primary"
              : hint === "before"
                ? "shadow-[inset_0_2px_0_0_var(--primary)]"
                : hint === "after"
                  ? "shadow-[inset_0_-2px_0_0_var(--primary)]"
                  : ""
          } ${dragging === element.id ? "opacity-50" : ""}`}
          style={{ paddingInlineStart: `${0.5 + depth * 0.75}rem` }}
          isActive={active}
          aria-label={`${element.name ?? element.type} layer`}
          draggable={!isRoot && renamingId !== element.id}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", element.id);
            setDragging(element.id);
          }}
          onDragEnd={() => {
            setDragging(null);
            setDropHint(null);
          }}
          onDragOver={(event) => {
            if (!dragging || dragging === element.id) return;
            const zone = zoneFor(event, element.type === "frame");
            if (!focused || !layerDropPlacement(focused.canvas.root, dragging, element.id, zone)) {
              return;
            }
            // Only a droppable row calls preventDefault, so the cursor reports invalid targets.
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropHint({ id: element.id, zone });
          }}
          onDragLeave={() =>
            setDropHint((current) => (current?.id === element.id ? null : current))
          }
          onDrop={(event) => {
            event.preventDefault();
            applyDrop(element.id, zoneFor(event, element.type === "frame"));
          }}
          onClick={() =>
            onSelect({
              artId: focused?.artId ?? null,
              elementIds: element.id === focused?.canvas.root.id ? [] : [element.id],
            })
          }
        >
          <span aria-hidden="true" className="w-4 text-[0.65rem] uppercase text-muted-foreground">
            {element.type.slice(0, 1)}
          </span>
          <span
            role="textbox"
            aria-label={`Rename ${element.name ?? element.id}`}
            className="truncate"
            contentEditable={renamingId === element.id}
            suppressContentEditableWarning
            onDoubleClick={() => setRenamingId(element.id)}
            onBlur={(event) => {
              if (renamingId !== element.id || !focused) return;
              onUpdateElement?.(focused.canvasId, element.id, {
                name: event.currentTarget.textContent ?? "",
              });
              setRenamingId(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          >
            {element.name?.trim() || element.id}
          </span>
        </SidebarMenuButton>
        {element.type === "frame"
          ? layerChildren(element).map((child) => renderTree(child, depth + 1))
          : null}
      </div>
    );
  };
  const groups = (["scene", "block"] as const).map((kind) => ({
    kind,
    artboards: ordered.filter((artboard) => artboard.kind === kind),
  }));
  return (
    <SidebarContent>
      <div className="p-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search layers"
          aria-label="Search layers"
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {groups.map(({ kind, artboards }) => {
        const matchingArtboards: CanvasArtboardDocument[] = [];
        for (const artboard of artboards) {
          if (!query.trim()) {
            matchingArtboards.push(artboard);
            continue;
          }
          const text = `${artboardLabel(artboard)} ${artboard.artId}`.toLowerCase();
          if (
            text.includes(query.toLowerCase()) ||
            flattenCanvasLayers(artboard.canvas.root).some((entry) => layerMatches(entry, query))
          ) {
            matchingArtboards.push(artboard);
          }
        }
        return (
          <SidebarGroup key={kind}>
            <SidebarGroupLabel>{kind === "scene" ? "Scenes" : "Blocks"}</SidebarGroupLabel>
            <SidebarGroupContent>
              {matchingArtboards.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">
                  No {kind === "scene" ? "Scenes" : "Blocks"} match.
                </p>
              ) : (
                <SidebarMenu>
                  {matchingArtboards.map((artboard) => (
                    <SidebarMenuItem key={artboard.artId}>
                      <SidebarMenuButton
                        aria-label={artboardLabel(artboard)}
                        isActive={
                          artboard.artId === focused?.artId && selection.elementIds.length === 0
                        }
                        onClick={() => {
                          onFocusArtboard(artboard.artId);
                          onSelect({ artId: artboard.artId, elementIds: [] });
                        }}
                      >
                        <Box aria-hidden="true" />
                        <span className="truncate">{artboardLabel(artboard)}</span>
                      </SidebarMenuButton>
                      {artboard.artId === focused?.artId
                        ? renderTree(artboard.canvas.root, 0)
                        : null}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
    </SidebarContent>
  );
}

type DragPreview = {
  parentId: string;
  rank: string;
  line: { x: number; y: number; width: number; height: number };
  auto: boolean;
};

// The editor owns camera, selection, overlays, and the two sidebars as one interaction surface.
// react-doctor-disable-next-line react-doctor/no-giant-component
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
  onUpdateElement,
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
  const [tool, setTool] = useState<CanvasCreationTool>("select");
  const [creationDraft, setCreationDraft] = useState<CreationDraft | null>(null);
  const elementDrag = useRef<ElementDragState | null>(null);
  const dragPreviewRef = useRef<DragPreview | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  // A drag moves the Element with a CSS translate, which changes no layout, so neither the
  // ResizeObserver nor the geometry key fires. The overlay has to be offset by the live delta
  // or it sits at the pre-drag position until the drop commits. `active` stays true only while
  // the pointer is down: after the drop the model carries the position, so the translate comes
  // off while the offset lives on until geometry catches up.
  const [dragOffset, setDragOffset] = useState<{
    elementId: string;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const clearOffsetAfterRemeasure = useRef(false);
  const clearResizeAfterRemeasure = useRef(false);
  // Resize runs on the same principle as the drag: one piece of state feeds both the Element's
  // preview styles and the overlay, so the handles never drift off the shape they are sizing.
  const resizeGesture = useRef<ResizeGesture | null>(null);
  const [resizeDraft, setResizeDraft] = useState<{
    elementId: string;
    start: ResizeBox;
    box: ResizeBox;
    active: boolean;
  } | null>(null);
  const [localSelection, setLocalSelection] = useState<CanvasSelection>({
    artId: null,
    elementIds: [],
  });
  const [rubberband, setRubberband] = useState<RubberbandState | null>(null);
  const focused = ordered.find((artboard) => artboard.artId === focusedArtId) ?? ordered[0] ?? null;
  const selection =
    selectedArtId === undefined
      ? localSelection
      : normalizeSelection({ artId: selectedArtId, elementIds: selectedElementIds ?? [] });
  const {
    camera,
    workspaceRef,
    beginCameraDrag,
    moveCameraDrag,
    endCameraDrag,
    zoomIn,
    zoomOut,
    resetCamera,
  } = useCanvasCamera(initialCamera, selection.artId !== null && selection.elementIds.length > 0);
  const geometryKey = useMemo(
    () =>
      `${camera.x}:${camera.y}:${camera.zoom}|${JSON.stringify(
        ordered.map(({ artId, position, canvas }) => [artId, position, canvas.root]),
      )}`,
    [camera, ordered],
  );
  const geometry = useCanvasGeometry(workspaceRef, geometryKey);
  const setSelection = (next: CanvasSelection) => {
    const normalized = normalizeSelection(next);
    setLocalSelection(normalized);
    onSelectionChange?.(normalized);
  };
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
  const beginElementDrag = (
    event: PointerEvent<HTMLElement>,
    artboard: CanvasArtboardDocument,
  ): boolean => {
    if (tool !== "select" || event.button !== 0) return false;
    const element = topmostPaintedElementAtPoint(
      event.currentTarget,
      event.clientX,
      event.clientY,
      event.altKey,
    );
    const elementId = element?.dataset.elementId;
    if (!elementId) return false;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = measuredRect(element);
    elementDrag.current = {
      artId: artboard.artId,
      canvasId: artboard.canvasId,
      elementId,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: { x: rect.x, y: rect.y },
      originParentId: element.dataset.elementParentId ?? null,
      originRank: element.dataset.elementRank ?? null,
    };
    dragPreviewRef.current = null;
    setDragPreview(null);
    setDragOffset(null);
    // Pressing an Element selects it, whether or not the press turns into a drag.
    setSelection({
      artId: artboard.artId,
      elementIds: toggleSelection(
        selection.artId === artboard.artId ? selection.elementIds : [],
        elementId,
        event.shiftKey,
      ),
    });
    onFocusArtboard(artboard.artId);
    return true;
  };

  const updateElementDrag = (event: PointerEvent<HTMLElement>) => {
    const activeDrag = elementDrag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    const dx = event.clientX - activeDrag.start.x;
    const dy = event.clientY - activeDrag.start.y;
    const element = [
      ...event.currentTarget.querySelectorAll<HTMLElement>("[data-element-id]"),
    ].find((candidate) => candidate.dataset.elementId === activeDrag.elementId);
    if (!element) return;
    // Both the Element's translate and the overlay's offset come from this one piece of state, so
    // they are written in the same commit and the outline cannot trail the shape it is wrapping.
    setDragOffset({ elementId: activeDrag.elementId, x: dx, y: dy, active: true });
    const draggedNode = element;
    const foreignArtboard = document
      .elementsFromPoint(event.clientX, event.clientY)
      .find((candidate) => candidate instanceof HTMLElement && candidate.dataset.artboardId) as
      | HTMLElement
      | undefined;
    if (foreignArtboard && foreignArtboard !== event.currentTarget) {
      dragPreviewRef.current = null;
      setDragPreview(null);
      return;
    }
    const frames: { node: HTMLElement; rect: CanvasClientRect }[] = [];
    for (const frame of event.currentTarget.querySelectorAll<HTMLElement>(
      "[data-element-type='frame']",
    )) {
      if (draggedNode.contains(frame)) continue;
      const rect = measuredRect(frame);
      if (
        event.clientX >= rect.x &&
        event.clientX <= rect.right &&
        event.clientY >= rect.y &&
        event.clientY <= rect.bottom
      ) {
        frames.push({ node: frame, rect });
      }
    }
    frames.sort(
      (left, right) => left.rect.width * left.rect.height - right.rect.width * right.rect.height,
    );
    const parent = frames[0];
    if (!parent) {
      dragPreviewRef.current = null;
      setDragPreview(null);
      return;
    }
    const auto = getComputedStyle(parent.node).display === "flex";
    const children: HTMLElement[] = [];
    for (const child of event.currentTarget.querySelectorAll<HTMLElement>(
      "[data-element-parent-id]",
    )) {
      if (
        child.dataset.elementParentId === parent.node.dataset.elementId &&
        child !== draggedNode
      ) {
        children.push(child);
      }
    }
    const flexDirection = getComputedStyle(parent.node).flexDirection;
    children.sort((left, right) => {
      const axis = flexDirection === "row" ? "x" : "y";
      return measuredRect(left)[axis] - measuredRect(right)[axis];
    });
    const axis = getComputedStyle(parent.node).flexDirection === "row" ? "x" : "y";
    const pointerOnAxis = axis === "x" ? event.clientX : event.clientY;
    const insertionIndex = children.findIndex((child) => {
      const rect = measuredRect(child);
      return (axis === "x" ? rect.x + rect.width / 2 : rect.y + rect.height / 2) > pointerOnAxis;
    });
    const rank = rankForInsertion(
      children.map((child) => child.dataset.elementRank ?? ""),
      insertionIndex < 0 ? children.length : insertionIndex,
    );
    const line = auto
      ? axis === "x"
        ? {
            x: insertionIndex < 0 ? parent.rect.right : measuredRect(children[insertionIndex]!).x,
            y: parent.rect.y,
            width: 2,
            height: parent.rect.height,
          }
        : {
            x: parent.rect.x,
            y: insertionIndex < 0 ? parent.rect.bottom : measuredRect(children[insertionIndex]!).y,
            width: parent.rect.width,
            height: 2,
          }
      : {
          x: parent.rect.x,
          y: parent.rect.y,
          width: parent.rect.width,
          height: parent.rect.height,
        };
    const nextPreview = { parentId: parent.node.dataset.elementId ?? "", rank, line, auto };
    dragPreviewRef.current = nextPreview;
    setDragPreview(nextPreview);
  };

  const finishElementDrag = (event: PointerEvent<HTMLElement>, cancel = false) => {
    const activeDrag = elementDrag.current;
    const preview = dragPreviewRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    const element = [
      ...event.currentTarget.querySelectorAll<HTMLElement>("[data-element-id]"),
    ].find((candidate) => candidate.dataset.elementId === activeDrag.elementId);
    let committed = false;
    if (element) {
      // Read while the drag translate is still applied — it comes off in the commit that follows,
      // and measuring after would snap back to the origin and make every move a no-op.
      const dropped = measuredRect(element);
      if (!cancel && preview?.parentId) {
        const parent = [
          ...event.currentTarget.querySelectorAll<HTMLElement>("[data-element-id]"),
        ].find((candidate) => candidate.dataset.elementId === preview.parentId);
        const parentRect = parent ? measuredRect(parent) : null;
        const properties =
          preview.auto || !parentRect
            ? {}
            : {
                anchor: {
                  horizontal: "left" as const,
                  vertical: "top" as const,
                  offsetX: (dropped.x - parentRect.x) / camera.zoom,
                  offsetY: (dropped.y - parentRect.y) / camera.zoom,
                },
              };
        // In an absolute parent rank is only z-order, which a reposition must not disturb.
        const sameParent = preview.parentId === activeDrag.originParentId;
        const rank =
          !preview.auto && sameParent ? (activeDrag.originRank ?? preview.rank) : preview.rank;
        const reparented = !sameParent || rank !== activeDrag.originRank;
        if (reparented) {
          onMoveElement?.(
            activeDrag.canvasId,
            activeDrag.elementId,
            preview.parentId,
            rank,
            properties,
            preview.auto ? ["anchor"] : [],
          );
          committed = true;
        } else if (Object.keys(properties).length > 0) {
          // Same parent, same rank — this is a reposition, not a reparent.
          onUpdateElement?.(activeDrag.canvasId, activeDrag.elementId, properties);
          committed = true;
        }
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    elementDrag.current = null;
    dragPreviewRef.current = null;
    setDragPreview(null);
    // An edit lands a commit before geometry re-measures, so dropping the offset now would flash
    // the overlay back to the pre-drag position for a frame. Keep it, minus the translate, until
    // the re-measure lands. A cancelled or rejected drop changes nothing, so it clears at once.
    if (committed) {
      clearOffsetAfterRemeasure.current = true;
      setDragOffset((current) => (current ? { ...current, active: false } : null));
    } else {
      setDragOffset(null);
    }
  };

  const beginResize = (event: PointerEvent<SVGElement>, handle: ResizeHandle) => {
    if (event.button !== 0) return;
    const artboard = ordered.find((candidate) => candidate.artId === selection.artId);
    const elementId = selection.elementIds[0];
    if (!artboard || !elementId || selection.elementIds.length !== 1) return;
    const measured = geometry.get(artboard.artId);
    const box = measured?.elements.get(elementId);
    if (!box) return;
    const element = findCanvasElement(artboard.canvas.root, elementId);
    const parentInfo = canvasElementParent(artboard.canvas.root, elementId);
    const parentElement = parentInfo
      ? findCanvasElement(artboard.canvas.root, parentInfo.parentId)
      : null;
    const parentBox = parentInfo ? measured?.elements.get(parentInfo.parentId) : undefined;
    event.stopPropagation();
    // Capture on the workspace, not the handle: the move and release handlers live there, and a
    // capture held by the handle would never be released by them.
    workspaceRef.current?.setPointerCapture(event.pointerId);
    const start = { x: box.x, y: box.y, width: box.width, height: box.height };
    resizeGesture.current = {
      artId: artboard.artId,
      canvasId: artboard.canvasId,
      elementId,
      handle,
      pointerId: event.pointerId,
      pointerStart: { x: event.clientX, y: event.clientY },
      start,
      parent: parentBox
        ? { x: parentBox.x, y: parentBox.y, width: parentBox.width, height: parentBox.height }
        : null,
      ratio: lockedAspectRatio(element),
      autoParent:
        parentElement?.type === "frame" &&
        (parentElement.layoutMode ?? parentElement.mode) === "auto",
    };
    setResizeDraft({ elementId, start, box: start, active: true });
  };

  const updateResize = (event: PointerEvent<HTMLElement>) => {
    const gesture = resizeGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    // A locked ratio constrains a corner drag on its own; Shift asks for the same thing ad hoc.
    const constrain = isCornerHandle(gesture.handle) && (event.shiftKey || gesture.ratio !== null);
    const box = resizeBox(
      gesture.start,
      gesture.handle,
      event.clientX - gesture.pointerStart.x,
      event.clientY - gesture.pointerStart.y,
      { constrain, ratio: gesture.ratio ?? undefined, min: camera.zoom },
    );
    setResizeDraft({ elementId: gesture.elementId, start: gesture.start, box, active: true });
  };

  const finishResize = (event: PointerEvent<HTMLElement>, cancel = false) => {
    const gesture = resizeGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const box = resizeDraft?.box ?? gesture.start;
    resizeGesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (cancel) {
      setResizeDraft(null);
      return;
    }
    const properties: Record<string, unknown> = {
      width: { mode: "fixed", value: box.width / camera.zoom },
      height: { mode: "fixed", value: box.height / camera.zoom },
    };
    // Only an absolutely positioned Element carries its own origin; in an auto-layout Frame the
    // parent decides where it sits, so resizing must not invent an anchor for it.
    if (!gesture.autoParent && gesture.parent) {
      properties.anchor = {
        horizontal: "left" as const,
        vertical: "top" as const,
        offsetX: (box.x - gesture.parent.x) / camera.zoom,
        offsetY: (box.y - gesture.parent.y) / camera.zoom,
      };
    }
    // An edge drag deliberately changes one axis, which is exactly what an aspect lock forbids.
    const unset = isCornerHandle(gesture.handle) ? [] : ["aspectRatio"];
    onUpdateElement?.(gesture.canvasId, gesture.elementId, properties, unset);
    clearResizeAfterRemeasure.current = true;
    setResizeDraft((current) => (current ? { ...current, active: false } : null));
  };

  useLayoutEffect(() => {
    if (!clearResizeAfterRemeasure.current) return;
    clearResizeAfterRemeasure.current = false;
    setResizeDraft(null);
  }, [geometry]);

  // The Element's size comes from the model, so a live preview is a style override, cleared by the
  // cleanup once the commit has landed and geometry has caught up.
  useLayoutEffect(() => {
    if (!resizeDraft?.active) return;
    const node = workspaceRef.current?.querySelector<HTMLElement>(
      `[data-element-id="${CSS.escape(resizeDraft.elementId)}"]`,
    );
    if (!node) return;
    const { box, start } = resizeDraft;
    // Restore rather than remove: width and height come from the renderer's React-managed style,
    // and React will not re-apply a property deleted behind its back — its virtual style still
    // says the value is there, so the Element would be left sizing itself to nothing.
    const previous = {
      width: node.style.width,
      height: node.style.height,
      translate: node.style.translate,
    };
    node.style.width = `${box.width / camera.zoom}px`;
    node.style.height = `${box.height / camera.zoom}px`;
    node.style.translate = `${(box.x - start.x) / camera.zoom}px ${(box.y - start.y) / camera.zoom}px`;
    return () => {
      node.style.width = previous.width;
      node.style.height = previous.height;
      node.style.translate = previous.translate;
    };
  }, [resizeDraft, camera.zoom, workspaceRef]);

  useLayoutEffect(() => {
    if (!clearOffsetAfterRemeasure.current) return;
    clearOffsetAfterRemeasure.current = false;
    setDragOffset(null);
  }, [geometry]);

  // The Element is rendered by CanvasRenderer, so the drag preview is a style write rather than a
  // prop. Doing it here rather than in the pointer handler keeps it in step with the overlay; the
  // cleanup takes the translate off again when the drag ends, is cancelled, or the zoom changes.
  useLayoutEffect(() => {
    if (!dragOffset?.active) return;
    const node = workspaceRef.current?.querySelector<HTMLElement>(
      `[data-element-id="${CSS.escape(dragOffset.elementId)}"]`,
    );
    if (!node) return;
    // The Element lives inside the camera's scale(), so pointer pixels have to be divided by the
    // zoom or the preview outruns the cursor. Restore rather than remove, so a translate the
    // renderer set would survive the preview.
    const previous = node.style.translate;
    node.style.translate = `${dragOffset.x / camera.zoom}px ${dragOffset.y / camera.zoom}px`;
    return () => {
      node.style.translate = previous;
    };
  }, [dragOffset, camera.zoom, workspaceRef]);
  const handleCanvasKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (focusContext().inKeyConsumingWidget) return;
    if (!selection.artId || selection.elementIds.length === 0) return;
    const artboard = ordered.find((candidate) => candidate.artId === selection.artId);
    if (!artboard) return;
    let handled = false;
    const root = artboard.canvas.root;
    for (const elementId of selection.elementIds) {
      const element = findCanvasElement(root, elementId);
      const parentInfo = element && canvasElementParent(root, elementId);
      const parent = parentInfo ? findCanvasElement(root, parentInfo.parentId) : null;
      if (!element || !parent || parent.type !== "frame") continue;
      const frame = parent as FrameElement;
      const autoLayout =
        frame.layoutMode === "auto" || frame.mode === "auto" || frame.autoLayout === true;
      const intent = canvasKeyboardIntent(
        frame.direction ?? "vertical",
        event.key,
        event.shiftKey,
        autoLayout,
        element.alignSelf,
      );
      if (!intent) continue;
      handled = true;
      if (intent.type === "nudge") {
        onUpdateElement?.(artboard.canvasId, elementId, {
          anchor: nudgeAnchor(element.anchor, intent.dx, intent.dy),
        });
      } else if (intent.type === "cross-align") {
        onUpdateElement?.(artboard.canvasId, elementId, { alignSelf: intent.value });
      } else {
        const siblings = [...(frame.children ?? [])]
          .filter((child) => child.id !== elementId)
          .sort((left, right) => (left.rank ?? "").localeCompare(right.rank ?? ""));
        const originalIndex = [...(frame.children ?? [])]
          .sort((left, right) => (left.rank ?? "").localeCompare(right.rank ?? ""))
          .findIndex((child) => child.id === elementId);
        const targetIndex =
          intent.delta === "start"
            ? 0
            : intent.delta === "end"
              ? siblings.length
              : Math.max(0, Math.min(siblings.length, originalIndex + intent.delta));
        onMoveElement?.(
          artboard.canvasId,
          elementId,
          frame.id,
          rankForInsertion(
            siblings.map((child) => child.rank ?? ""),
            targetIndex,
          ),
        );
      }
    }
    if (handled) event.preventDefault();
  };
  // A band can start on empty workspace or on an artboard's backdrop, so these three are shared
  // by the workspace and the artboards rather than living on the workspace alone.
  const beginRubberband = (event: PointerEvent<HTMLElement>, artId: string | null = null) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setRubberband({
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      current: { x: event.clientX, y: event.clientY },
      artId,
    });
  };

  const updateRubberband = (event: PointerEvent<HTMLElement>) => {
    setRubberband((current) =>
      current && current.pointerId === event.pointerId
        ? { ...current, current: { x: event.clientX, y: event.clientY } }
        : current,
    );
  };

  const endRubberband = (event: PointerEvent<HTMLElement>) => {
    if (!rubberband || rubberband.pointerId !== event.pointerId) return;
    const start = rubberband.start;
    const current = { x: event.clientX, y: event.clientY };
    const band = {
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
      width: Math.abs(current.x - start.x),
      height: Math.abs(current.y - start.y),
      right: Math.max(start.x, current.x),
      bottom: Math.max(start.y, current.y),
    };
    // The artboard the pointer actually went down on wins. Falling back to a geometric search
    // would pick whichever overlapping artboard sorts first, which is how selection and focus
    // came to disagree; the search is only for a band drawn from empty workspace onto one.
    const target =
      (rubberband.artId
        ? ordered.find((artboard) => artboard.artId === rubberband.artId)
        : undefined) ??
      (rubberband.artId
        ? undefined
        : ordered.find((artboard) => {
            const measured = geometry.get(artboard.artId);
            return measured ? rectsOverlap(measured.rect, band) : false;
          }));
    if (target) {
      const measured = geometry.get(target.artId);
      const ids = measured
        ? containedSelection(
            [...measured.elements].flatMap(([id, rect]) =>
              id === measured.rootElementId ? [] : [{ id, rect }],
            ),
            band,
          )
        : [];
      setSelection({ artId: target.artId, elementIds: ids });
      onFocusArtboard(target.artId);
    } else if (band.width < 2 && band.height < 2) {
      setSelection({ artId: null, elementIds: [] });
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setRubberband(null);
  };

  const beginWorkspaceInteraction = (event: PointerEvent<HTMLElement>) => {
    beginCameraDrag(event);
    if (event.target !== event.currentTarget) return;
    beginRubberband(event);
  };

  const moveWorkspaceInteraction = (event: PointerEvent<HTMLElement>) => {
    moveCameraDrag(event);
    updateResize(event);
    updateRubberband(event);
  };

  const endWorkspaceInteraction = (event: PointerEvent<HTMLElement>) => {
    endCameraDrag(event);
    finishResize(event);
    endRubberband(event);
  };

  const cancelWorkspaceInteraction = (event: PointerEvent<HTMLElement>) => {
    endCameraDrag(event);
    finishResize(event, true);
    endRubberband(event);
  };
  const beginCreation = (event: PointerEvent<HTMLElement>, artboard: CanvasArtboardDocument) => {
    if (tool === "select" || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setCreationDraft({
      tool,
      artId: artboard.artId,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      current: { x: event.clientX, y: event.clientY },
    });
  };

  const moveCreation = (event: PointerEvent<HTMLElement>) => {
    if (!creationDraft || creationDraft.pointerId !== event.pointerId) return;
    setCreationDraft((current) =>
      current && current.pointerId === event.pointerId
        ? { ...current, current: { x: event.clientX, y: event.clientY } }
        : current,
    );
  };

  const finishCreation = (event: PointerEvent<HTMLElement>, cancel = false) => {
    if (!creationDraft || creationDraft.pointerId !== event.pointerId) return;
    const draft = creationDraft;
    setCreationDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const artboard = ordered.find((candidate) => candidate.artId === draft.artId);
    if (!artboard) return;
    if (cancel) {
      setTool("select");
      return;
    }
    const rect = {
      x: Math.min(draft.start.x, event.clientX),
      y: Math.min(draft.start.y, event.clientY),
      width: Math.abs(event.clientX - draft.start.x),
      height: Math.abs(event.clientY - draft.start.y),
      right: Math.max(draft.start.x, event.clientX),
      bottom: Math.max(draft.start.y, event.clientY),
    };
    if (rect.width < 4 || rect.height < 4) return;
    const root = event.currentTarget.querySelector<HTMLElement>("[data-canvas-root]");
    if (!root) return;
    const frames = [
      ...event.currentTarget.querySelectorAll<HTMLElement>("[data-element-type='frame']"),
    ].flatMap((frame) => {
      const id = frame.dataset.elementId;
      if (!id) return [];
      const measured = frame.getBoundingClientRect();
      return [
        {
          id,
          rect: {
            x: measured.x,
            y: measured.y,
            width: measured.width,
            height: measured.height,
            right: measured.right,
            bottom: measured.bottom,
          },
        },
      ];
    });
    const parentId = containingFrame(frames, rect) ?? root.dataset.elementId;
    if (!parentId) return;
    const parent = frames.find((frame) => frame.id === parentId);
    if (!parent) return;
    const parentNode = [
      ...event.currentTarget.querySelectorAll<HTMLElement>("[data-element-id]"),
    ].find((element) => element.dataset.elementId === parentId);
    const parentRect = parent.rect;
    const parentIsAuto = parentNode ? getComputedStyle(parentNode).display === "flex" : false;
    const children = [
      ...event.currentTarget.querySelectorAll<HTMLElement>("[data-element-parent-id]"),
    ]
      .filter((element) => element.dataset.elementParentId === parentId)
      .sort((left, right) => {
        const axis =
          parentIsAuto && getComputedStyle(parentNode!).flexDirection === "row" ? "x" : "y";
        return left.getBoundingClientRect()[axis] - right.getBoundingClientRect()[axis];
      });
    const axis =
      parentIsAuto && parentNode && getComputedStyle(parentNode).flexDirection === "row"
        ? "x"
        : "y";
    const center = axis === "x" ? (rect.x + rect.right) / 2 : (rect.y + rect.bottom) / 2;
    const insertionIndex = children.findIndex((child) => {
      const measured = child.getBoundingClientRect();
      return (
        (axis === "x" ? measured.x + measured.width / 2 : measured.y + measured.height / 2) > center
      );
    });
    const rank = rankForInsertion(
      children.map((child) => child.dataset.elementRank ?? ""),
      insertionIndex < 0 ? children.length : insertionIndex,
    );
    const width = Math.max(1, rect.width / camera.zoom);
    const height = Math.max(1, rect.height / camera.zoom);
    const id = `element-${globalThis.crypto.randomUUID()}`;
    const element: NewElement = {
      id,
      type: draft.tool,
      rank,
      width: { mode: "fixed", value: width },
      height: { mode: "fixed", value: height },
      ...(draft.tool === "rect" ? { fill: "#cbd5e1" } : {}),
      ...(draft.tool === "frame" ? { layoutMode: "absolute", fill: "#f8fafc" } : {}),
      ...(draft.tool === "text" ? { content: "Text", color: "#0f172a" } : {}),
      ...(draft.tool === "image"
        ? { src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" }
        : {}),
      ...(!parentIsAuto
        ? {
            anchor: {
              horizontal: "left" as const,
              vertical: "top" as const,
              offsetX: (rect.x - parentRect.x) / camera.zoom,
              offsetY: (rect.y - parentRect.y) / camera.zoom,
            },
          }
        : {}),
    };
    onCreateElement?.(artboard.canvasId, element, parentId, rank);
    setSelection({ artId: artboard.artId, elementIds: [id] });
    onFocusArtboard(artboard.artId);
    setTool("select");
  };

  const selectAtPoint = (event: PointerEvent<HTMLElement>, artboard: CanvasArtboardDocument) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const element = topmostPaintedElementAtPoint(
      event.currentTarget,
      event.clientX,
      event.clientY,
      event.altKey,
    );
    onFocusArtboard(artboard.artId);
    if (!element?.dataset.elementId) {
      setSelection({ artId: artboard.artId, elementIds: [] });
      return;
    }
    setSelection({
      artId: artboard.artId,
      elementIds: toggleSelection(
        selection.artId === artboard.artId ? selection.elementIds : [],
        element.dataset.elementId,
        event.shiftKey,
      ),
    });
  };

  const workspaceBounds = workspaceRef.current?.getBoundingClientRect();
  const selectedGeometry = selection.artId ? geometry.get(selection.artId) : undefined;
  const selectedRect =
    selectedGeometry && selection.elementIds.length > 0
      ? selectionRect(
          selection.elementIds.flatMap((id) => {
            const rect = selectedGeometry.elements.get(id);
            return rect ? [rect] : [];
          }),
        )
      : (selectedGeometry?.rect ?? null);
  // Only the dragged Element moves, so the offset applies when it is the whole selection.
  const liveOffset =
    dragOffset &&
    selection.elementIds.length === 1 &&
    selection.elementIds[0] === dragOffset.elementId
      ? dragOffset
      : null;
  // A resize in flight is the truth about where the box is; geometry has not caught up yet.
  const liveResize =
    resizeDraft &&
    selection.elementIds.length === 1 &&
    selection.elementIds[0] === resizeDraft.elementId
      ? resizeDraft.box
      : null;
  const overlayRect = workspaceBounds
    ? liveResize
      ? {
          x: liveResize.x - workspaceBounds.x,
          y: liveResize.y - workspaceBounds.y,
          width: liveResize.width,
          height: liveResize.height,
        }
      : selectedRect
        ? {
            x: selectedRect.x - workspaceBounds.x + (liveOffset?.x ?? 0),
            y: selectedRect.y - workspaceBounds.y + (liveOffset?.y ?? 0),
            width: selectedRect.width,
            height: selectedRect.height,
          }
        : null
    : null;
  // Resizing a composite box would have to distribute the change across Elements, which is a
  // different feature; a multi-selection keeps the outline and loses only the handles.
  const resizable = selection.elementIds.length === 1;
  const creationOverlayRect =
    creationDraft && workspaceBounds
      ? {
          x: Math.min(creationDraft.start.x, creationDraft.current.x) - workspaceBounds.x,
          y: Math.min(creationDraft.start.y, creationDraft.current.y) - workspaceBounds.y,
          width: Math.abs(creationDraft.current.x - creationDraft.start.x),
          height: Math.abs(creationDraft.current.y - creationDraft.start.y),
        }
      : null;
  const dragLine =
    dragPreview && workspaceBounds
      ? {
          x: dragPreview.line.x - workspaceBounds.x,
          y: dragPreview.line.y - workspaceBounds.y,
          width: dragPreview.line.width,
          height: dragPreview.line.height,
        }
      : null;
  const rubberbandRect =
    rubberband && workspaceBounds
      ? {
          x: Math.min(rubberband.start.x, rubberband.current.x) - workspaceBounds.x,
          y: Math.min(rubberband.start.y, rubberband.current.y) - workspaceBounds.y,
          width: Math.abs(rubberband.current.x - rubberband.start.x),
          height: Math.abs(rubberband.current.y - rubberband.start.y),
        }
      : null;

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
              onSelect={setSelection}
              onUpdateElement={onUpdateElement}
              onMoveElement={onMoveElement}
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

            <main
              ref={workspaceRef}
              className="relative min-h-0 flex-1 overscroll-none overflow-hidden bg-muted/20 outline-none"
              aria-label="Canvas workspace"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setCreationDraft(null);
                  setTool("select");
                }
                handleCanvasKeyDown(event);
              }}
              onPointerDown={beginWorkspaceInteraction}
              onPointerMove={moveWorkspaceInteraction}
              onPointerUp={endWorkspaceInteraction}
              onPointerCancel={cancelWorkspaceInteraction}
              style={{ touchAction: "none" }}
            >
              <div
                className="pointer-events-auto absolute top-3 left-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-lg backdrop-blur"
                role="toolbar"
                aria-label="Canvas creation tools"
              >
                {(["select", "rect", "text", "image", "frame"] as const).map((candidate) => (
                  <Button
                    key={candidate}
                    type="button"
                    size="sm"
                    variant={tool === candidate ? "secondary" : "ghost"}
                    aria-pressed={tool === candidate}
                    onClick={() => setTool(candidate)}
                  >
                    {candidate[0]!.toUpperCase() + candidate.slice(1)}
                  </Button>
                ))}
              </div>
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
                    <button
                      type="button"
                      key={artboard.artId}
                      className="pointer-events-auto absolute cursor-pointer rounded-lg border border-border bg-background text-left shadow-xl data-[focused=true]:border-primary data-[focused=true]:ring-2 data-[focused=true]:ring-primary/35"
                      data-artboard-id={artboard.artId}
                      data-canvas-id={artboard.canvasId}
                      data-artboard-kind={artboard.kind}
                      data-owner-kind={artboard.kind}
                      data-focused={artboard.artId === focused?.artId ? "true" : "false"}
                      style={{
                        left: artboard.position.x,
                        top: artboard.position.y,
                        width: size.width,
                      }}
                      aria-label={artboardLabel(artboard)}
                      onPointerDown={(event) => {
                        if (tool !== "select") {
                          beginCreation(event, artboard);
                          return;
                        }
                        if (beginElementDrag(event, artboard)) return;
                        // Pressing the artboard's backdrop clears the selection and starts a band.
                        selectAtPoint(event, artboard);
                        beginRubberband(event, artboard.artId);
                      }}
                      onPointerMove={(event) => {
                        updateElementDrag(event);
                        updateRubberband(event);
                        moveCreation(event);
                      }}
                      onPointerUp={(event) => {
                        finishElementDrag(event);
                        endRubberband(event);
                        finishCreation(event);
                      }}
                      onPointerCancel={(event) => {
                        finishElementDrag(event, true);
                        endRubberband(event);
                        finishCreation(event, true);
                      }}
                      onClick={() => onFocusArtboard(artboard.artId)}
                    >
                      <div
                        className={`flex h-10 items-center justify-between gap-2 border-b border-border px-3 text-xs ${
                          drag?.artId === artboard.artId ? "cursor-grabbing" : "cursor-grab"
                        }`}
                        onPointerDown={(event) => beginDrag(event, artboard)}
                        onPointerMove={(event) => {
                          moveDrag(event, artboard);
                          moveCreation(event);
                        }}
                        onPointerUp={(event) => {
                          endDrag(event);
                          finishCreation(event);
                        }}
                        onPointerCancel={(event) => {
                          endDrag(event, true);
                          finishCreation(event, true);
                        }}
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
                    </button>
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
                            onPointerDown={(event) => beginResize(event, handle)}
                          />
                        );
                      })}
                  </>
                ) : null}
                {creationOverlayRect ? (
                  <rect
                    x={creationOverlayRect.x}
                    y={creationOverlayRect.y}
                    width={creationOverlayRect.width}
                    height={creationOverlayRect.height}
                    style={{ color: "var(--primary)" }}
                    fill="none"
                    stroke="currentColor"
                    strokeDasharray="8 4"
                    strokeLinecap="round"
                    strokeWidth="2"
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

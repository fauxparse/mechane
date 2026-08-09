import { Box, Layers3, Minus, PanelLeft, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent } from "react";
import { useMemo, useRef, useState } from "react";

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
  rectContainsPoint,
  selectionRect,
  toggleSelection,
  topmostPaintedElementAtPoint,
} from "./canvas-selection";
import type { CanvasSelection } from "./canvas-selection";
import { containingFrame, rankForInsertion } from "./canvas-creation";
import type { CanvasCreationTool } from "./canvas-creation";
import { canvasElementParent, findCanvasElement } from "@mechane/commands";
import type { CanvasClientRect } from "./canvas-geometry";
import type { FrameElement } from "@mechane/domain";
import { canvasKeyboardIntent, nudgeAnchor } from "./canvas-keyboard";
import { focusContext } from "../show/keyboard/focus-context";

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
};

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
  const [localSelection, setLocalSelection] = useState<CanvasSelection>({
    artId: null,
    elementIds: [],
  });
  const [rubberband, setRubberband] = useState<RubberbandState | null>(null);
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
  const geometryKey = useMemo(
    () =>
      `${camera.x}:${camera.y}:${camera.zoom}|${JSON.stringify(
        ordered.map(({ artId, position, canvas }) => [artId, position, canvas.root]),
      )}`,
    [camera, ordered],
  );
  const geometry = useCanvasGeometry(workspaceRef, geometryKey);
  const selection =
    selectedArtId === undefined
      ? localSelection
      : normalizeSelection({ artId: selectedArtId, elementIds: selectedElementIds ?? [] });
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
    const element = topmostPaintedElementAtPoint(event.currentTarget, event.clientX, event.clientY);
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
    };
    dragPreviewRef.current = null;
    setDragPreview(null);
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
    element.style.setProperty("translate", `${dx}px ${dy}px`);
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
    if (element) {
      element.style.removeProperty("translate");
      if (!cancel && preview?.parentId) {
        const parent = [
          ...event.currentTarget.querySelectorAll<HTMLElement>("[data-element-id]"),
        ].find((candidate) => candidate.dataset.elementId === preview.parentId);
        const properties = preview.auto
          ? {}
          : {
              anchor: {
                horizontal: "left" as const,
                vertical: "top" as const,
                offsetX:
                  (measuredRect(element).x - (parent ? measuredRect(parent).x : 0)) / camera.zoom,
                offsetY:
                  (measuredRect(element).y - (parent ? measuredRect(parent).y : 0)) / camera.zoom,
              },
            };
        onMoveElement?.(
          activeDrag.canvasId,
          activeDrag.elementId,
          preview.parentId,
          preview.rank,
          properties,
          preview.auto ? ["anchor"] : [],
        );
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    elementDrag.current = null;
    dragPreviewRef.current = null;
    setDragPreview(null);
  };
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
  const beginWorkspaceInteraction = (event: PointerEvent<HTMLElement>) => {
    beginCameraDrag(event);
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setRubberband({
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      current: { x: event.clientX, y: event.clientY },
    });
  };

  const moveWorkspaceInteraction = (event: PointerEvent<HTMLElement>) => {
    moveCameraDrag(event);
    if (!rubberband || rubberband.pointerId !== event.pointerId) return;
    setRubberband((current) =>
      current && current.pointerId === event.pointerId
        ? { ...current, current: { x: event.clientX, y: event.clientY } }
        : current,
    );
  };

  const endWorkspaceInteraction = (event: PointerEvent<HTMLElement>) => {
    endCameraDrag(event);
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
    const target = ordered.find((artboard) => {
      const measured = geometry.get(artboard.artId);
      return measured ? rectContainsPoint(measured.rect, start.x, start.y) : false;
    });
    if (target) {
      const measured = geometry.get(target.artId);
      const ids = measured
        ? containedSelection(
            [...measured.elements].flatMap(([id, rect]) => {
              const element = [...document.querySelectorAll<HTMLElement>("[data-element-id]")].find(
                (candidate) => candidate.dataset.elementId === id,
              );
              return element?.dataset.elementRoot === "true" ? [] : [{ id, rect }];
            }),
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
  const overlayRect =
    selectedRect && workspaceBounds
      ? {
          x: selectedRect.x - workspaceBounds.x,
          y: selectedRect.y - workspaceBounds.y,
          width: selectedRect.width,
          height: selectedRect.height,
        }
      : null;
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
              onPointerCancel={endWorkspaceInteraction}
              onWheel={handleWheel}
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
                        if (!beginElementDrag(event, artboard)) selectAtPoint(event, artboard);
                      }}
                      onPointerMove={(event) => {
                        updateElementDrag(event);
                        moveCreation(event);
                      }}
                      onPointerUp={(event) => {
                        finishElementDrag(event);
                        finishCreation(event);
                      }}
                      onPointerCancel={(event) => {
                        finishElementDrag(event, true);
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
                    {selection.elementIds.length > 0 &&
                      [
                        [overlayRect.x, overlayRect.y],
                        [overlayRect.x + overlayRect.width, overlayRect.y],
                        [overlayRect.x, overlayRect.y + overlayRect.height],
                        [overlayRect.x + overlayRect.width, overlayRect.y + overlayRect.height],
                      ].map(([x, y]) => (
                        <circle
                          key={`${x}:${y}`}
                          cx={x}
                          cy={y}
                          r="4"
                          fill="white"
                          stroke="currentColor"
                          strokeWidth="1"
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
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
                    stroke="hsl(var(--primary))"
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

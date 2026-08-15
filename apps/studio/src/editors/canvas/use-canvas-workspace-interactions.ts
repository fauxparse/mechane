import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { canvasElementParent, findCanvasElement } from "@mechane/commands";
import type { NewElement } from "@mechane/commands";
import type { Position, FrameElement } from "@mechane/domain";

import type { CanvasArtboardDocument } from "../../api/canvas";
import { selectedCanvasRects, useCanvasGeometry } from "./graph/canvas-geometry";
import type { CanvasClientRect } from "./graph/canvas-geometry";
import type { CanvasSelection } from "./graph/canvas-selection";
import { useCanvasCamera } from "./graph/use-canvas-camera";
import { roundToLogicalPixel } from "./graph/canvas-pixels";

import {
  containedSelection,
  normalizeSelection,
  rectsOverlap,
  selectionRect,
  toggleSelection,
  topmostPaintedElementAtPoint,
} from "./graph/canvas-selection";
import {
  containingFrame,
  creationRect,
  fixedFillSizing,
  rankForInsertion,
  showsReparentPreview,
} from "./commands/canvas-creation";
import type { CanvasCreationTool } from "./commands/canvas-creation";
import { canvasKeyboardIntent, nudgeAnchor } from "./keyboard/canvas-keyboard";
import { focusContext } from "../show/keyboard/focus-context";
import { arrangeIntentFor, arrangeWithinParent } from "./commands/canvas-arrange";
import type { ArrangeIntent } from "./commands/canvas-arrange";
import {
  fixedResizeProperties,
  isCornerHandle,
  lockedAspectRatio,
  resizeBox,
  scaleWithin,
} from "./commands/canvas-resize";
import type { ResizeBox, ResizeHandle } from "./commands/canvas-resize";
import type { CanvasWorkspaceEditorProps } from "./canvas-workspace-types";
import { artboardLabel } from "./data/canvas-workspace";

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
  square: boolean;
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
  originAutoParent: boolean;
};

/** One Element caught up in a resize, with everything needed to place it again afterwards. */
type ResizeSubject = {
  elementId: string;
  /** Screen-space box the Element occupied when the handle was grabbed. */
  start: ResizeBox;
  /** Screen-space box of the parent, so an absolute anchor can be expressed relative to it. */
  parent: ResizeBox | null;
  autoParent: boolean;
};

type ResizeGesture = {
  artId: string;
  canvasId: string;
  handle: ResizeHandle;
  pointerId: number;
  pointerStart: { x: number; y: number };
  /** The selection box the handle drags — one Element's box, or the union of several. */
  start: ResizeBox;
  subjects: readonly ResizeSubject[];
  /** Only a lone Element brings its own aspect lock; a union has no ratio of its own. */
  ratio: number | null;
};

type DragPreview = {
  artId: string;
  canvasId: string;
  parentId: string;
  rank: string;
  line: { x: number; y: number; width: number; height: number };
  auto: boolean;
};
export function useCanvasWorkspaceInteractions({
  artboards,
  focusedArtId,
  onFocusArtboard,
  onBeginMoveArtboard,
  onMoveArtboard,
  onEndMoveArtboard,
  selectedArtId,
  selectedElementIds,
  onSelectionChange,
  initialCamera,
  onCreateElement,
  onMoveElement,
  onMoveElementBetweenCanvases,
  onUpdateElement,
  onDeleteElements,
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
  const resizeCommitted = useRef(false);
  // Resize runs on the same principle as the drag: one piece of state feeds both the Element's
  // preview styles and the overlay, so the handles never drift off the shape they are sizing.
  const resizeGesture = useRef<ResizeGesture | null>(null);
  const [resizeDraft, setResizeDraft] = useState<{
    artId: string;
    start: ResizeBox;
    box: ResizeBox;
    subjects: readonly ResizeSubject[];
    active: boolean;
  } | null>(null);
  const [localSelection, setLocalSelection] = useState<CanvasSelection>({
    artId: null,
    elementIds: [],
  });
  const [rubberband, setRubberband] = useState<RubberbandState | null>(null);
  const [renamingArtId, setRenamingArtId] = useState<string | null>(null);
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
  const beginDrag = (event: PointerEvent<HTMLElement>, artboard: CanvasArtboardDocument) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    // Best effort, as elsewhere: a capture that cannot be taken must not stop the drag.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // No capture; the handlers still see the drag while it stays inside.
    }
    setDrag({
      artId: artboard.artId,
      canvasId: artboard.canvasId,
      pointerId: event.pointerId,
      origin: { ...artboard.position },
      start: { x: event.clientX, y: event.clientY },
    });
    onBeginMoveArtboard(artboard.canvasId);
  };

  const moveDrag = (event: PointerEvent<HTMLElement>, artboard: CanvasArtboardDocument) => {
    if (!drag || drag.artId !== artboard.artId || drag.pointerId !== event.pointerId) return;
    onMoveArtboard(artboard.canvasId, {
      x: drag.origin.x + (event.clientX - drag.start.x) / camera.zoom,
      y: drag.origin.y + (event.clientY - drag.start.y) / camera.zoom,
    });
  };

  const endDrag = (event: PointerEvent<HTMLElement>, cancel = false) => {
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
    const parentNode = element.dataset.elementParentId
      ? [...event.currentTarget.querySelectorAll<HTMLElement>("[data-element-id]")].find(
          (candidate) => candidate.dataset.elementId === element.dataset.elementParentId,
        )
      : undefined;
    elementDrag.current = {
      artId: artboard.artId,
      canvasId: artboard.canvasId,
      elementId,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: { x: rect.x, y: rect.y },
      originParentId: element.dataset.elementParentId ?? null,
      originRank: element.dataset.elementRank ?? null,
      originAutoParent: parentNode ? getComputedStyle(parentNode).display === "flex" : false,
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
    const artboardsAtPoint = document
      .elementsFromPoint(event.clientX, event.clientY)
      .filter(
        (candidate): candidate is HTMLElement =>
          candidate instanceof HTMLElement && Boolean(candidate.dataset.artboardId),
      );
    const foreignArtboard = artboardsAtPoint.find(
      (candidate) => candidate.dataset.artboardId !== activeDrag.artId,
    );
    const targetArtboard = foreignArtboard ?? event.currentTarget;
    const targetDocument = ordered.find(
      (candidate) => candidate.artId === targetArtboard.dataset.artboardId,
    );
    if (!targetDocument) {
      dragPreviewRef.current = null;
      setDragPreview(null);
      return;
    }
    const draggedNode = element;
    const frames: { node: HTMLElement; rect: CanvasClientRect }[] = [];
    for (const frame of targetArtboard.querySelectorAll<HTMLElement>(
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
    for (const child of targetArtboard.querySelectorAll<HTMLElement>("[data-element-parent-id]")) {
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
    const targetParentId = parent.node.dataset.elementId;
    const sameAbsoluteParent =
      !auto && targetParentId === activeDrag.originParentId && !activeDrag.originAutoParent;
    const showPreview =
      targetParentId !== undefined &&
      showsReparentPreview(
        activeDrag.originParentId,
        activeDrag.originRank,
        activeDrag.originAutoParent,
        targetParentId,
        auto,
        rank,
      );
    if (!targetParentId || (!sameAbsoluteParent && !showPreview)) {
      dragPreviewRef.current = null;
      setDragPreview(null);
      return;
    }
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
    const nextPreview = {
      artId: targetDocument.artId,
      canvasId: targetDocument.canvasId,
      parentId: parent.node.dataset.elementId ?? "",
      rank,
      line,
      auto,
    };
    dragPreviewRef.current = nextPreview;
    setDragPreview(showPreview ? nextPreview : null);
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
        const targetSurface = workspaceRef.current?.querySelector<HTMLElement>(
          `[data-artboard-id="${CSS.escape(preview.artId)}"]`,
        );
        const parent = targetSurface
          ? [...targetSurface.querySelectorAll<HTMLElement>("[data-element-id]")].find(
              (candidate) => candidate.dataset.elementId === preview.parentId,
            )
          : undefined;
        const parentRect = parent ? measuredRect(parent) : null;
        const modelArtboard = ordered.find((candidate) => candidate.artId === activeDrag.artId);
        const modelElement = modelArtboard
          ? findCanvasElement(modelArtboard.canvas.root, activeDrag.elementId)
          : null;
        const properties: Record<string, unknown> =
          preview.auto || !parentRect
            ? {}
            : {
                anchor: {
                  horizontal: "left" as const,
                  vertical: "top" as const,
                  offsetX: roundToLogicalPixel(dropped.x - parentRect.x, camera.zoom),
                  offsetY: roundToLogicalPixel(dropped.y - parentRect.y, camera.zoom),
                },
                ...(activeDrag.originAutoParent && modelElement
                  ? fixedFillSizing(
                      modelElement,
                      roundToLogicalPixel(dropped.width, camera.zoom),
                      roundToLogicalPixel(dropped.height, camera.zoom),
                    )
                  : {}),
              };
        // In an absolute parent rank is only z-order, which a reposition must not disturb.
        const sameArtboard = preview.artId === activeDrag.artId;
        const sameParent = sameArtboard && preview.parentId === activeDrag.originParentId;
        const rank =
          !preview.auto && sameParent ? (activeDrag.originRank ?? preview.rank) : preview.rank;
        const reparented = !sameArtboard || !sameParent || rank !== activeDrag.originRank;
        if (reparented) {
          if (sameArtboard) {
            onMoveElement?.(
              activeDrag.canvasId,
              activeDrag.elementId,
              preview.parentId,
              rank,
              properties,
              preview.auto ? ["anchor"] : [],
            );
          } else {
            onMoveElementBetweenCanvases?.(
              activeDrag.canvasId,
              preview.canvasId,
              activeDrag.elementId,
              preview.parentId,
              rank,
              properties,
              preview.auto ? ["anchor"] : [],
            );
          }
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
    if (committed && preview && preview.artId !== activeDrag.artId) {
      setSelection({ artId: preview.artId, elementIds: [activeDrag.elementId] });
      onFocusArtboard(preview.artId);
    }
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
    const measured = artboard ? geometry.get(artboard.artId) : undefined;
    if (!artboard || !measured) return;
    const rootSelected =
      selection.elementIds.length === 0 && measured.rootElementId === artboard.canvas.root.id;
    const subjectIds =
      selection.elementIds.length > 0 ? selection.elementIds : [artboard.canvas.root.id];
    const subjects = subjectIds.flatMap<ResizeSubject>((elementId) => {
      const box =
        rootSelected && elementId === artboard.canvas.root.id
          ? measured.rect
          : measured.elements.get(elementId);
      if (!box) return [];
      const parentInfo = canvasElementParent(artboard.canvas.root, elementId);
      const parentElement = parentInfo
        ? findCanvasElement(artboard.canvas.root, parentInfo.parentId)
        : null;
      const parentBox = parentInfo ? measured.elements.get(parentInfo.parentId) : undefined;
      return [
        {
          elementId,
          start: { x: box.x, y: box.y, width: box.width, height: box.height },
          parent: parentBox
            ? { x: parentBox.x, y: parentBox.y, width: parentBox.width, height: parentBox.height }
            : null,
          autoParent:
            parentElement?.type === "frame" &&
            (parentElement.layoutMode === "auto" || parentElement.autoLayout === true),
        },
      ];
    });
    if (subjects.length === 0) return;
    // What the handle drags is the selection box: one Element's box, or the union of several.
    const union = selectionRect(
      subjects.map(({ start: box }) => ({
        ...box,
        right: box.x + box.width,
        bottom: box.y + box.height,
      })),
    );
    if (!union) return;
    const soleElement =
      subjects.length === 1
        ? findCanvasElement(artboard.canvas.root, subjects[0]!.elementId)
        : null;
    event.stopPropagation();
    // Capture on the workspace, not the handle: the move and release handlers live there, and a
    // capture held by the handle would never be released by them. Capture is best effort — it
    // throws for a pointer that is no longer active, and losing it only costs tracking outside
    // the workspace, so it must not take the gesture down with it.
    try {
      workspaceRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // No capture; the workspace's own handlers still see the drag while it stays inside.
    }
    const start = { x: union.x, y: union.y, width: union.width, height: union.height };
    resizeGesture.current = {
      artId: artboard.artId,
      canvasId: artboard.canvasId,
      handle,
      pointerId: event.pointerId,
      pointerStart: { x: event.clientX, y: event.clientY },
      start,
      subjects,
      ratio: lockedAspectRatio(soleElement),
    };
    setResizeDraft({ artId: artboard.artId, start, box: start, subjects, active: true });
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
    setResizeDraft({
      artId: gesture.artId,
      start: gesture.start,
      box,
      subjects: gesture.subjects,
      active: true,
    });
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
    // An edge drag deliberately changes one axis, which is exactly what an aspect lock forbids.
    const unset = isCornerHandle(gesture.handle) ? [] : ["aspectRatio"];
    const artboard = ordered.find((candidate) => candidate.artId === gesture.canvasId);
    for (const subject of gesture.subjects) {
      const next = scaleWithin(subject.start, gesture.start, box);
      const modelElement = artboard
        ? findCanvasElement(artboard.canvas.root, subject.elementId)
        : null;
      const properties: Record<string, unknown> = modelElement
        ? fixedResizeProperties(
            modelElement,
            Math.max(1, roundToLogicalPixel(next.width, camera.zoom)),
            Math.max(1, roundToLogicalPixel(next.height, camera.zoom)),
          )
        : {
            width: {
              mode: "fixed",
              value: Math.max(1, roundToLogicalPixel(next.width, camera.zoom)),
            },
            height: {
              mode: "fixed",
              value: Math.max(1, roundToLogicalPixel(next.height, camera.zoom)),
            },
          };
      // Only an absolutely positioned Element carries its own origin; in an auto-layout Frame the
      // parent decides where it sits, so resizing must not invent an anchor for it.
      if (!subject.autoParent && subject.parent) {
        properties.anchor = {
          horizontal: "left" as const,
          vertical: "top" as const,
          offsetX: roundToLogicalPixel(next.x - subject.parent.x, camera.zoom),
          offsetY: roundToLogicalPixel(next.y - subject.parent.y, camera.zoom),
        };
      }
      onUpdateElement?.(gesture.canvasId, subject.elementId, properties, unset);
    }
    // The commit re-renders the Element at the size just previewed, so the override must be
    // abandoned rather than unwound.
    resizeCommitted.current = true;
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
    const { box, start, subjects } = resizeDraft;
    // Width and height belong to the renderer's React-managed style, which makes both obvious
    // cleanups wrong: removing them leaves React believing a value it no longer has, and
    // restoring the pre-drag value clobbers the size React just wrote from the commit. So the
    // override is only unwound when the resize was abandoned and React has nothing new to say.
    const restore = subjects.flatMap((subject) => {
      const node = workspaceRef.current?.querySelector<HTMLElement>(
        `[data-element-id="${CSS.escape(subject.elementId)}"]`,
      );
      if (!node) return [];
      const previous = {
        width: node.style.width,
        height: node.style.height,
        translate: node.style.translate,
      };
      const next = scaleWithin(subject.start, start, box);
      node.style.width = `${next.width / camera.zoom}px`;
      node.style.height = `${next.height / camera.zoom}px`;
      // An auto-layout parent owns the child's position. Let the browser apply the relative size
      // adjustment and measure the resulting position instead of pinning an edge to the pointer.
      if (!subject.autoParent) {
        node.style.translate = `${(next.x - subject.start.x) / camera.zoom}px ${
          (next.y - subject.start.y) / camera.zoom
        }px`;
      }
      return [{ node, previous }];
    });
    if (subjects.some((subject) => subject.autoParent)) {
      const actual = selectionRect(
        subjects.flatMap((subject) => {
          const node = workspaceRef.current?.querySelector<HTMLElement>(
            `[data-element-id="${CSS.escape(subject.elementId)}"]`,
          );
          return node ? [measuredRect(node)] : [];
        }),
      );
      if (
        actual &&
        (Math.abs(actual.x - box.x) > 0.01 ||
          Math.abs(actual.y - box.y) > 0.01 ||
          Math.abs(actual.width - box.width) > 0.01 ||
          Math.abs(actual.height - box.height) > 0.01)
      ) {
        setResizeDraft((current) =>
          current && current === resizeDraft ? { ...current, box: actual } : current,
        );
      }
    }

    return () => {
      for (const { node, previous } of restore) {
        // Position comes back from the model's anchor, so the preview translate always goes.
        node.style.translate = previous.translate;
        if (!resizeCommitted.current) {
          node.style.width = previous.width;
          node.style.height = previous.height;
        }
      }
      resizeCommitted.current = false;
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
  /** Returns whether it consumed the key, so the caller knows to swallow it. */
  const deleteSelection = (): boolean => {
    if (focusContext().inKeyConsumingWidget) return false;
    if (!selection.artId || selection.elementIds.length === 0) return false;
    const artboard = ordered.find((candidate) => candidate.artId === selection.artId);
    if (!artboard) return false;
    // The root is the artboard's backdrop rather than a layer, and removing it would leave
    // nothing to render into.
    const removable = selection.elementIds.filter((id) => id !== artboard.canvas.root.id);
    if (removable.length === 0) return false;
    onDeleteElements?.(artboard.canvasId, removable);
    setSelection({ artId: artboard.artId, elementIds: [] });
    return true;
  };
  /** Moves the selection through its parent's stacking order. Returns whether it consumed the key. */
  const arrangeSelection = (intent: ArrangeIntent): boolean => {
    if (focusContext().inKeyConsumingWidget) return false;
    if (!selection.artId || selection.elementIds.length === 0) return false;
    const artboard = ordered.find((candidate) => candidate.artId === selection.artId);
    if (!artboard) return false;
    const root = artboard.canvas.root;
    // A selection spanning parents arranges within each one; nothing crosses a parent boundary.
    const byParent = new Map<string, string[]>();
    for (const elementId of selection.elementIds) {
      const parentInfo = canvasElementParent(root, elementId);
      if (!parentInfo) continue;
      byParent.set(parentInfo.parentId, [...(byParent.get(parentInfo.parentId) ?? []), elementId]);
    }
    let moved = false;
    for (const [parentId, elementIds] of byParent) {
      const parent = findCanvasElement(root, parentId);
      if (!parent || parent.type !== "frame") continue;
      for (const move of arrangeWithinParent(parent as FrameElement, elementIds, intent)) {
        onMoveElement?.(artboard.canvasId, move.elementId, move.parentId, move.rank);
        moved = true;
      }
    }
    return moved;
  };

  // The window listener below is bound once, so it reaches the current selection through a ref.
  const arrangeSelectionRef = useRef(arrangeSelection);
  useEffect(() => {
    arrangeSelectionRef.current = arrangeSelection;
  });
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const intent = arrangeIntentFor(event);
      if (!intent) return;
      if (arrangeSelectionRef.current(intent)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const deleteSelectionRef = useRef(deleteSelection);
  useEffect(() => {
    deleteSelectionRef.current = deleteSelection;
  });

  // Deleting belongs to the selection, not to whichever pane happens to hold focus: the layers
  // navigator selects Elements too, and a Delete there must not quietly do nothing.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      if (deleteSelectionRef.current()) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleCanvasKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (focusContext().inKeyConsumingWidget) return;
    if (!selection.artId || selection.elementIds.length === 0) return;
    const artboard = ordered.find((candidate) => candidate.artId === selection.artId);
    if (!artboard) return;
    const root = artboard.canvas.root;
    let handled = false;
    for (const elementId of selection.elementIds) {
      const element = findCanvasElement(root, elementId);
      const parentInfo = element && canvasElementParent(root, elementId);
      const parent = parentInfo ? findCanvasElement(root, parentInfo.parentId) : null;
      if (!element || !parent || parent.type !== "frame") continue;
      const frame = parent as FrameElement;
      const autoLayout = frame.layoutMode === "auto" || frame.autoLayout === true;
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
    // Best effort, as for a resize: capture throws for a pointer that is no longer active, and
    // losing it only costs tracking outside the element — the band itself must still start.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // No capture; the handlers still see the drag while it stays inside.
    }
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
      square: event.shiftKey,
    });
  };

  const moveCreation = (event: PointerEvent<HTMLElement>) => {
    if (!creationDraft || creationDraft.pointerId !== event.pointerId) return;
    setCreationDraft((current) =>
      current && current.pointerId === event.pointerId
        ? {
            ...current,
            current: { x: event.clientX, y: event.clientY },
            square: event.shiftKey,
          }
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
    const rect = creationRect(
      draft.start,
      { x: event.clientX, y: event.clientY },
      draft.square || event.shiftKey,
    );
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
    const width = Math.max(1, roundToLogicalPixel(rect.width, camera.zoom));
    const height = Math.max(1, roundToLogicalPixel(rect.height, camera.zoom));
    const id = `element-${globalThis.crypto.randomUUID()}`;
    const element: NewElement = {
      id,
      type: draft.tool,
      rank,
      width: { mode: "fixed", value: width },
      height: { mode: "fixed", value: height },
      ...(draft.tool === "frame" ? { clip: true } : {}),
      ...(draft.tool === "rect" || draft.tool === "ellipse" ? { fill: "#cbd5e1" } : {}),
      ...(draft.tool === "text" ? { content: "Text", color: "#0f172a" } : {}),
      ...(draft.tool === "image"
        ? { src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" }
        : {}),
      ...(!parentIsAuto
        ? {
            anchor: {
              horizontal: "left" as const,
              vertical: "top" as const,
              offsetX: roundToLogicalPixel(rect.x - parentRect.x, camera.zoom),
              offsetY: roundToLogicalPixel(rect.y - parentRect.y, camera.zoom),
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
  // Directly selecting a Canvas selects its root Frame, so Scenes and Blocks expose the same
  // resize handles as nested Elements without making the backdrop a hit-test target.
  const selectedIds =
    selection.elementIds.length > 0
      ? selection.elementIds
      : selectedGeometry?.rootElementId
        ? [selectedGeometry.rootElementId]
        : [];
  const selectedRect =
    selectedGeometry && selectedIds.length > 0
      ? selectionRect(selectedCanvasRects(selectedGeometry, selectedIds))
      : null;
  // Only the dragged Element moves, so the offset applies when it is the whole selection.
  const liveOffset =
    dragOffset &&
    selection.elementIds.length === 1 &&
    selection.elementIds[0] === dragOffset.elementId
      ? dragOffset
      : null;
  // A resize in flight is the truth about where the box is; geometry has not caught up yet.
  const liveResize = resizeDraft?.box ?? null;
  const resizePreview =
    resizeDraft &&
    workspaceBounds &&
    resizeDraft.subjects.length === 1 &&
    selectedGeometry?.rootElementId === resizeDraft.subjects[0]?.elementId
      ? {
          artId: resizeDraft.artId,
          x: (resizeDraft.box.x - workspaceBounds.x - camera.x) / camera.zoom,
          y: (resizeDraft.box.y - workspaceBounds.y - camera.y) / camera.zoom,
          width: resizeDraft.box.width / camera.zoom,
          height: resizeDraft.box.height / camera.zoom,
        }
      : null;
  const selectedArtboard = ordered.find((artboard) => artboard.artId === selection.artId);
  const previewElementId =
    selection.elementIds.length === 1 ? selection.elementIds[0] : selectedGeometry?.rootElementId;
  const previewParentId =
    selectedArtboard && previewElementId
      ? canvasElementParent(selectedArtboard.canvas.root, previewElementId)?.parentId
      : null;
  const previewParent = previewParentId
    ? (selectedGeometry?.elements.get(previewParentId) ?? null)
    : null;
  const inspectorPreview =
    liveOffset?.active && previewElementId === liveOffset.elementId
      ? (() => {
          const current = selectedGeometry?.elements.get(liveOffset.elementId);
          if (!current) return null;
          const x = current.x + liveOffset.x;
          const y = current.y + liveOffset.y;
          return {
            elementId: liveOffset.elementId,
            ...(previewParent
              ? {
                  x: Math.round((x - previewParent.x) / camera.zoom),
                  y: Math.round((y - previewParent.y) / camera.zoom),
                }
              : {}),
            width: Math.round(current.width / camera.zoom),
            height: Math.round(current.height / camera.zoom),
          };
        })()
      : resizeDraft?.active &&
          resizeDraft.subjects.length === 1 &&
          previewElementId === resizeDraft.subjects[0]?.elementId
        ? (() => {
            const subject = resizeDraft.subjects[0];
            if (!subject) return null;
            const current = scaleWithin(subject.start, resizeDraft.start, resizeDraft.box);
            return {
              elementId: subject.elementId,
              ...(previewParent
                ? {
                    x: Math.round((current.x - previewParent.x) / camera.zoom),
                    y: Math.round((current.y - previewParent.y) / camera.zoom),
                  }
                : {}),
              width: Math.round(current.width / camera.zoom),
              height: Math.round(current.height / camera.zoom),
            };
          })()
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
  // Any Element selection, including a directly selected Canvas root, can be resized.
  const resizable = selectedIds.length > 0;
  const creationBox = creationDraft
    ? creationRect(creationDraft.start, creationDraft.current, creationDraft.square)
    : null;
  const creationOverlayRect =
    creationBox && workspaceBounds
      ? {
          x: creationBox.x - workspaceBounds.x,
          y: creationBox.y - workspaceBounds.y,
          width: creationBox.width,
          height: creationBox.height,
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
  return {
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
    inspectorPreview,
    resizable,
    cancelCreation: () => {
      setCreationDraft(null);
      setTool("select");
    },
    zoomIn,
    zoomOut,
    resetCamera,
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
  };
}

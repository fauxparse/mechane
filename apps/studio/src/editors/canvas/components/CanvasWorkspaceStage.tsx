import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent, RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Puzzle, TvMinimal } from "@mechane/design-system";
import { CanvasRenderer } from "@mechane/rendering";
import { canvasElementParent, findCanvasElement } from "@mechane/commands";
import type { NewElement } from "@mechane/commands";
import { isContainerElement } from "@mechane/domain";
import type { FrameElement, Position } from "@mechane/domain";
import type { CanvasCamera } from "./canvas-camera";

import type { CanvasArtboardDocument } from "../../../api/canvas";
import { contentOrigin, selectedCanvasRects } from "./canvas-geometry";
import type { CanvasClientRect, CanvasGeometrySnapshot } from "./canvas-geometry";
import { roundToLogicalPixel } from "./canvas-pixels";
import {
  authoredSelectionBoundary,
  containedSelection,
  rectsOverlap,
  selectionRect,
  toggleSelection,
  topmostElementAtPoint,
  topmostPaintedElementAtPoint,
} from "./canvas-selection";
import type { CanvasSelection } from "./canvas-selection";
import {
  canvasForCreation,
  containingFrame,
  creationRect,
  rankForInsertion,
} from "../commands/canvas-creation";
import type { CanvasCreationTool } from "../commands/canvas-creation";
import { newElementForCanvasCreation } from "../commands/canvas-creation";
import { freeArtboardPosition } from "../data/canvas-workspace";
import {
  handleCursor,
  handlePosition,
  isCornerHandle,
  lockedAspectRatio,
  RESIZE_HANDLES,
  resizeBox,
  resizeElementUpdate,
  scaleWithin,
} from "../commands/canvas-resize";
import type {
  CanvasElementUpdate,
  CanvasResizeSubject,
  ResizeBox,
  ResizeHandle,
} from "../commands/canvas-resize";
import { planCanvasElementDrop } from "../commands/canvas-element-drop";
import type {
  CanvasElementDragOrigin,
  CanvasElementDropPlan,
  CanvasElementDropSite,
} from "../commands/canvas-element-drop";
import type {
  CanvasArtboardDimensions,
  CanvasBlockCreationRequest,
} from "../canvas-workspace-types";
import { artboardLabel, canvasArtboardSize } from "../data/canvas-workspace";
import { canvasKeyboardIntent, nudgeAnchor } from "../keyboard/canvas-keyboard";
import { focusContext } from "../../show/keyboard/focus-context";
import { useCanvasTextEditing } from "./use-canvas-text-editing";

const HANDLE_SIZE = 8;

export interface CanvasLiveElementGeometry {
  readonly elementId: string;
  readonly x?: number;
  readonly y?: number;
  readonly width: number;
  readonly height: number;
}
type DragPreview = {
  readonly target: CanvasElementDropSite;
  readonly line: Pick<CanvasClientRect, "x" | "y" | "width" | "height">;
  readonly showLine: boolean;
};

export interface CanvasWorkspaceViewport {
  readonly camera: CanvasCamera;
  readonly workspaceRef: RefObject<HTMLElement | null>;
  beginCameraDrag(event: PointerEvent<HTMLElement>): void;
  moveCameraDrag(event: PointerEvent<HTMLElement>): void;
  endCameraDrag(event: PointerEvent<HTMLElement>): void;
}

export type CanvasStageIntent =
  | { readonly kind: "select"; readonly selection: CanvasSelection }
  | { readonly kind: "focus"; readonly artId: string; readonly frameBlock: boolean }
  | { readonly kind: "artboard-move"; readonly phase: "begin"; readonly canvasId: string }
  | {
      readonly kind: "artboard-move";
      readonly phase: "move";
      readonly canvasId: string;
      readonly position: Position;
    }
  | {
      readonly kind: "artboard-move";
      readonly phase: "end";
      readonly canvasId: string;
      readonly cancel: boolean;
    }
  | { readonly kind: "element-drop"; readonly plan: CanvasElementDropPlan }
  | {
      readonly kind: "resize";
      readonly canvasId: string;
      readonly updates: readonly CanvasElementUpdate[];
    }
  | {
      readonly kind: "create-element";
      readonly artId: string;
      readonly canvasId: string;
      readonly element: NewElement;
      readonly parentId: string;
      readonly rank: string;
    }
  | { readonly kind: "create-block"; readonly request: CanvasBlockCreationRequest }
  | { readonly kind: "creation-missed-canvas" }
  | { readonly kind: "cancel-creation" }
  | {
      readonly kind: "update-element";
      readonly canvasId: string;
      readonly elementId: string;
      readonly properties: Record<string, unknown>;
      readonly unsetProperties?: readonly string[];
    }
  | {
      readonly kind: "move-element";
      readonly canvasId: string;
      readonly elementId: string;
      readonly parentId: string;
      readonly rank: string;
    }
  | { readonly kind: "rename-artboard"; readonly artId: string; readonly name: string };

export interface CanvasWorkspaceStageProps {
  readonly ordered: readonly CanvasArtboardDocument[];
  readonly focused: CanvasArtboardDocument | null;
  readonly artboardSizes: ReadonlyMap<string, CanvasArtboardDimensions>;
  readonly viewport: CanvasWorkspaceViewport;
  readonly geometrySnapshot: CanvasGeometrySnapshot;
  readonly selection: CanvasSelection;
  readonly tool: CanvasCreationTool;
  readonly renamingArtId: string | null;
  onRenamingArtIdChange(artId: string | null): void;
  onIntent(intent: CanvasStageIntent): void;
  onLiveElementGeometry(preview: CanvasLiveElementGeometry | null): void;
}

type ElementDragState = {
  readonly artId: string;
  readonly canvasId: string;
  readonly elementId: string;
  readonly pointerId: number;
  readonly start: Position;
  readonly origin: Position;
  readonly originParentId: string | null;
  readonly originRank: string | null;
  readonly originAutoParent: boolean;
};

interface CanvasResizeDraft {
  readonly artId: string;
  readonly handle: ResizeHandle;
  readonly start: ResizeBox;
  readonly box: ResizeBox;
  readonly actual: ResizeBox;
  readonly subjects: readonly CanvasResizeSubject[];
}

type CanvasStageGesture =
  | {
      readonly kind: "artboard-move";
      readonly pointerId: number;
      readonly artId: string;
      readonly canvasId: string;
      readonly origin: Position;
      readonly start: Position;
      readonly captureTarget: HTMLElement;
    }
  | {
      readonly kind: "rubberband";
      readonly pointerId: number;
      readonly start: Position;
      readonly current: Position;
      readonly artId: string | null;
      readonly captureTarget: HTMLElement;
    }
  | {
      readonly kind: "creation";
      readonly pointerId: number;
      readonly tool: Exclude<CanvasCreationTool, "select">;
      readonly start: Position;
      readonly current: Position;
      readonly square: boolean;
      readonly captureTarget: HTMLElement;
    }
  | {
      readonly kind: "element-move";
      readonly phase: "active";
      readonly pointerId: number;
      readonly drag: ElementDragState;
      readonly offset: Position;
      readonly preview: DragPreview | null;
      readonly captureTarget: HTMLElement;
    }
  | {
      readonly kind: "element-move";
      readonly phase: "settling";
      readonly elementId: string;
      readonly offset: Position;
      readonly afterGeometryRevision: number;
    }
  | {
      readonly kind: "resize";
      readonly phase: "active";
      readonly pointerId: number;
      readonly gesture: {
        readonly artId: string;
        readonly canvasId: string;
        readonly handle: ResizeHandle;
        readonly pointerStart: Position;
        readonly start: ResizeBox;
        readonly subjects: readonly CanvasResizeSubject[];
        readonly ratio: number | null;
      };
      readonly draft: CanvasResizeDraft;
      readonly captureTarget: HTMLElement;
    }
  | {
      readonly kind: "resize";
      readonly phase: "settling";
      readonly draft: CanvasResizeDraft;
      readonly afterGeometryRevision: number;
    };

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

function authoredElementForSelection(
  element: HTMLElement | null,
  artboard: HTMLElement,
  root: FrameElement,
): HTMLElement | null {
  if (!element) return null;
  return authoredSelectionBoundary(
    element,
    artboard,
    (current) => current.parentElement,
    (current) => {
      const id = current.dataset.elementId;
      return id !== undefined && findCanvasElement(root, id) !== null;
    },
  );
}

// The stage keeps pointer handlers and their overlay ordering in one event surface.
// react-doctor-disable-next-line no-giant-component
export function CanvasWorkspaceStage({
  ordered,
  focused,
  artboardSizes,
  viewport,
  geometrySnapshot,
  selection,
  tool,
  renamingArtId,
  onRenamingArtIdChange,
  onIntent,
  onLiveElementGeometry,
}: CanvasWorkspaceStageProps) {
  const { camera, workspaceRef, beginCameraDrag, moveCameraDrag, endCameraDrag } = viewport;
  const geometry = geometrySnapshot.geometry;
  const gestureRef = useRef<CanvasStageGesture | null>(null);
  const [gesture, setGestureState] = useState<CanvasStageGesture | null>(null);
  const setGesture = useCallback((next: CanvasStageGesture | null) => {
    gestureRef.current = next;
    setGestureState(next);
  }, []);
  const resizeStyles = useRef(new Map<string, { node: HTMLElement; cssText: string }>());
  const liveGeometrySink = useRef(onLiveElementGeometry);
  const resizeCommitted = useRef(false);
  const selectedGeometry = selection.artId ? geometry.get(selection.artId) : undefined;
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
  const workspaceBounds = workspaceRef.current?.getBoundingClientRect();
  const resizeDraft = gesture?.kind === "resize" ? gesture.draft : null;
  const elementMove = gesture?.kind === "element-move" ? gesture : null;
  const activeElementMove = elementMove?.phase === "active" ? elementMove : null;
  const liveOffset = elementMove;
  const liveResize = resizeDraft?.actual ?? null;
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

  const inspectorPreview = useMemo<CanvasLiveElementGeometry | null>(() => {
    if (!previewElementId) return null;
    if (liveOffset) {
      const elementId =
        liveOffset.phase === "active" ? liveOffset.drag.elementId : liveOffset.elementId;
      if (elementId === previewElementId) {
        const current = selectedGeometry?.elements.get(elementId);
        if (!current) return null;
        const offset = liveOffset.offset;
        return {
          elementId,
          ...(current.x !== undefined && previewParent
            ? { x: current.x + offset.x - previewParent.x }
            : {}),
          ...(current.y !== undefined && previewParent
            ? { y: current.y + offset.y - previewParent.y }
            : {}),
          width: current.width,
          height: current.height,
        };
      }
    }
    if (
      resizeDraft &&
      resizeDraft.subjects.length === 1 &&
      previewElementId === resizeDraft.subjects[0]?.elementId
    ) {
      const subject = resizeDraft.subjects[0];
      if (!subject) return null;
      const current = scaleWithin(subject.start, resizeDraft.start, resizeDraft.actual);
      return {
        elementId: subject.elementId,
        ...(previewParent
          ? { x: current.x - previewParent.x, y: current.y - previewParent.y }
          : {}),
        width: current.width,
        height: current.height,
      };
    }
    return null;
  }, [liveOffset, previewElementId, previewParent, resizeDraft, selectedGeometry]);
  useEffect(() => {
    liveGeometrySink.current = onLiveElementGeometry;
  }, [onLiveElementGeometry]);
  useEffect(() => {
    liveGeometrySink.current(
      inspectorPreview
        ? {
            ...inspectorPreview,
            ...(inspectorPreview.x !== undefined ? { x: inspectorPreview.x / camera.zoom } : {}),
            ...(inspectorPreview.y !== undefined ? { y: inspectorPreview.y / camera.zoom } : {}),
            width: inspectorPreview.width / camera.zoom,
            height: inspectorPreview.height / camera.zoom,
          }
        : null,
    );
  }, [camera.zoom, inspectorPreview]);

  const beginDrag = (event: PointerEvent<HTMLElement>, artboard: CanvasArtboardDocument) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Best effort; losing capture only stops tracking outside the label.
    }
    setGesture({
      kind: "artboard-move",
      pointerId: event.pointerId,
      artId: artboard.artId,
      canvasId: artboard.canvasId,
      origin: { ...artboard.position },
      start: { x: event.clientX, y: event.clientY },
      captureTarget: event.currentTarget,
    });
    onIntent({ kind: "artboard-move", phase: "begin", canvasId: artboard.canvasId });
  };

  const moveDrag = (event: PointerEvent<HTMLElement>, artboard: CanvasArtboardDocument) => {
    const current = gestureRef.current;
    if (
      !current ||
      current.kind !== "artboard-move" ||
      current.artId !== artboard.artId ||
      current.pointerId !== event.pointerId
    )
      return;
    onIntent({
      kind: "artboard-move",
      phase: "move",
      canvasId: artboard.canvasId,
      position: {
        x: current.origin.x + (event.clientX - current.start.x) / camera.zoom,
        y: current.origin.y + (event.clientY - current.start.y) / camera.zoom,
      },
    });
  };

  const endDrag = (event: PointerEvent<HTMLElement>, cancel = false) => {
    const current = gestureRef.current;
    if (!current || current.kind !== "artboard-move" || current.pointerId !== event.pointerId)
      return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    onIntent({ kind: "artboard-move", phase: "end", canvasId: current.canvasId, cancel });
    setGesture(null);
  };

  const beginElementDrag = (
    event: PointerEvent<HTMLElement>,
    artboard: CanvasArtboardDocument,
  ): boolean => {
    if (tool !== "select" || event.button !== 0) return false;
    const element = authoredElementForSelection(
      artboard.kind === "block"
        ? topmostElementAtPoint(event.currentTarget, event.clientX, event.clientY)
        : topmostPaintedElementAtPoint(
            event.currentTarget,
            event.clientX,
            event.clientY,
            event.altKey,
          ),
      event.currentTarget,
      artboard.canvas.root,
    );
    const elementId = element?.dataset.elementId;
    if (!elementId) return false;
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Best effort; the drag remains valid while it stays in the artboard.
    }
    const rect = measuredRect(element);
    const parentNode = element.dataset.elementParentId
      ? [...event.currentTarget.querySelectorAll<HTMLElement>("[data-element-id]")].find(
          (candidate) => candidate.dataset.elementId === element.dataset.elementParentId,
        )
      : undefined;
    const drag: ElementDragState = {
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
    setGesture({
      kind: "element-move",
      phase: "active",
      pointerId: event.pointerId,
      drag,
      offset: { x: 0, y: 0 },
      preview: null,
      captureTarget: event.currentTarget,
    });
    onIntent({
      kind: "select",
      selection: {
        artId: artboard.artId,
        elementIds: toggleSelection(
          selection.artId === artboard.artId ? selection.elementIds : [],
          elementId,
          event.shiftKey,
        ),
      },
    });
    onIntent({ kind: "focus", artId: artboard.artId, frameBlock: false });
    return true;
  };

  const updateElementDrag = (event: PointerEvent<HTMLElement>) => {
    const current = gestureRef.current;
    if (
      !current ||
      current.kind !== "element-move" ||
      current.phase !== "active" ||
      current.pointerId !== event.pointerId
    )
      return;
    const dx = event.clientX - current.drag.start.x;
    const dy = event.clientY - current.drag.start.y;
    const element = [
      ...event.currentTarget.querySelectorAll<HTMLElement>("[data-element-id]"),
    ].find((candidate) => candidate.dataset.elementId === current.drag.elementId);
    if (!element) return;
    const artboardsAtPoint = document
      .elementsFromPoint(event.clientX, event.clientY)
      .filter(
        (candidate): candidate is HTMLElement =>
          candidate instanceof HTMLElement && Boolean(candidate.dataset.artboardId),
      );
    const foreignArtboard = artboardsAtPoint.find(
      (candidate) => candidate.dataset.artboardId !== current.drag.artId,
    );
    const targetNode = foreignArtboard ?? event.currentTarget;
    const targetDocument = ordered.find(
      (candidate) => candidate.artId === targetNode.dataset.artboardId,
    );
    if (!targetDocument) {
      setGesture({ ...current, offset: { x: dx, y: dy }, preview: null });
      return;
    }
    const overSlot = document.elementsFromPoint(event.clientX, event.clientY).some((candidate) => {
      if (!(candidate instanceof HTMLElement)) return false;
      const slot = candidate.closest<HTMLElement>("[data-element-type='slot']");
      return slot !== null && targetNode.contains(slot);
    });
    if (overSlot) {
      setGesture({ ...current, offset: { x: dx, y: dy }, preview: null });
      return;
    }
    const frames = [
      ...targetNode.querySelectorAll<HTMLElement>("[data-element-type='frame']"),
    ].flatMap((frame) => {
      const id = frame.dataset.elementId;
      const frameElement = id ? findCanvasElement(targetDocument.canvas.root, id) : null;
      if (!frameElement || !isContainerElement(frameElement) || element.contains(frame)) return [];
      const rect = measuredRect(frame);
      return event.clientX >= rect.x &&
        event.clientX <= rect.right &&
        event.clientY >= rect.y &&
        event.clientY <= rect.bottom
        ? [{ node: frame, rect }]
        : [];
    });
    frames.sort(
      (left, right) => left.rect.width * left.rect.height - right.rect.width * right.rect.height,
    );
    const parent = frames[0];
    if (!parent) {
      setGesture({ ...current, offset: { x: dx, y: dy }, preview: null });
      return;
    }
    const children = [...targetNode.querySelectorAll<HTMLElement>("[data-element-parent-id]")]
      .filter(
        (child) =>
          child.dataset.elementParentId === parent.node.dataset.elementId && child !== element,
      )
      .sort((left, right) => {
        const axis = getComputedStyle(parent.node).flexDirection === "row" ? "x" : "y";
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
    const parentId = parent.node.dataset.elementId;
    if (!parentId) {
      setGesture({ ...current, offset: { x: dx, y: dy }, preview: null });
      return;
    }
    const auto = getComputedStyle(parent.node).display === "flex";
    const showLine =
      !(!auto && parentId === current.drag.originParentId && !current.drag.originAutoParent) &&
      (parentId !== current.drag.originParentId || (auto && rank !== current.drag.originRank));
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
    const preview: DragPreview = {
      target: {
        artId: targetDocument.artId,
        canvasId: targetDocument.canvasId,
        parentId,
        rank,
        auto,
      },
      line,
      showLine,
    };
    setGesture({ ...current, offset: { x: dx, y: dy }, preview });
  };

  const finishElementDrag = (event: PointerEvent<HTMLElement>, cancel = false) => {
    const current = gestureRef.current;
    if (
      !current ||
      current.kind !== "element-move" ||
      current.phase !== "active" ||
      current.pointerId !== event.pointerId
    )
      return;
    const element = [
      ...event.currentTarget.querySelectorAll<HTMLElement>("[data-element-id]"),
    ].find((candidate) => candidate.dataset.elementId === current.drag.elementId);
    const preview = current.preview;
    let plan: CanvasElementDropPlan = { kind: "none", select: null };
    if (!cancel && element && preview) {
      const targetSurface = workspaceRef.current?.querySelector<HTMLElement>(
        `[data-artboard-id="${CSS.escape(preview.target.artId)}"]`,
      );
      const parent = targetSurface
        ? [...targetSurface.querySelectorAll<HTMLElement>("[data-element-id]")].find(
            (candidate) => candidate.dataset.elementId === preview.target.parentId,
          )
        : undefined;
      const parentRect = parent ? measuredRect(parent) : null;
      const targetArtboard = ordered.find((candidate) => candidate.artId === preview.target.artId);
      const parentElement = targetArtboard
        ? findCanvasElement(targetArtboard.canvas.root, preview.target.parentId)
        : null;
      const parentStrokeWidth =
        parentElement && "stroke" in parentElement
          ? Math.max(0, parentElement.stroke?.width ?? 0)
          : 0;
      const parentOrigin = parentRect
        ? contentOrigin(parentRect, parentStrokeWidth, parentStrokeWidth, camera.zoom)
        : null;
      const sourceArtboard = ordered.find((candidate) => candidate.artId === current.drag.artId);
      const sourceElement = sourceArtboard
        ? findCanvasElement(sourceArtboard.canvas.root, current.drag.elementId)
        : null;
      plan = planCanvasElementDrop({
        origin: {
          artId: current.drag.artId,
          canvasId: current.drag.canvasId,
          elementId: current.drag.elementId,
          parentId: current.drag.originParentId,
          rank: current.drag.originRank,
          autoParent: current.drag.originAutoParent,
        } satisfies CanvasElementDragOrigin,
        site: preview.target,
        dropped: measuredRect(element),
        parentOrigin,
        element: sourceElement,
        zoom: camera.zoom,
      });
      if (plan.kind !== "none") onIntent({ kind: "element-drop", plan });
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (plan.kind !== "none") {
      setGesture({
        kind: "element-move",
        phase: "settling",
        elementId: current.drag.elementId,
        offset: current.offset,
        afterGeometryRevision: geometrySnapshot.revision,
      });
    } else {
      setGesture(null);
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
    const subjects = subjectIds.flatMap<CanvasResizeSubject>((elementId) => {
      const box =
        rootSelected && elementId === artboard.canvas.root.id
          ? measured.rect
          : measured.elements.get(elementId);
      if (!box || !findCanvasElement(artboard.canvas.root, elementId)) return [];
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
          autoParent: parentElement?.type === "frame" && parentElement.layoutMode === "auto",
        },
      ];
    });
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
    try {
      workspaceRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Best effort; tracking inside the workspace remains available.
    }
    const resizeGesture = {
      artId: artboard.artId,
      canvasId: artboard.canvasId,
      handle,
      pointerStart: { x: event.clientX, y: event.clientY },
      start: union,
      subjects,
      ratio: lockedAspectRatio(soleElement),
    };
    setGesture({
      kind: "resize",
      phase: "active",
      pointerId: event.pointerId,
      gesture: resizeGesture,
      draft: { artId: artboard.artId, handle, start: union, box: union, actual: union, subjects },
      captureTarget: workspaceRef.current ?? event.currentTarget.ownerDocument.body,
    });
  };

  const updateResize = (event: PointerEvent<HTMLElement>) => {
    const current = gestureRef.current;
    if (
      !current ||
      current.kind !== "resize" ||
      current.phase !== "active" ||
      current.pointerId !== event.pointerId
    )
      return;
    const { gesture: resizeGesture } = current;
    const requested = resizeBox(
      resizeGesture.start,
      resizeGesture.handle,
      event.clientX - resizeGesture.pointerStart.x,
      event.clientY - resizeGesture.pointerStart.y,
      {
        constrain:
          isCornerHandle(resizeGesture.handle) && (event.shiftKey || resizeGesture.ratio !== null),
        ratio: resizeGesture.ratio ?? undefined,
        min: camera.zoom,
      },
    );
    setGesture({ ...current, draft: { ...current.draft, box: requested, actual: requested } });
  };

  const finishResize = (event: PointerEvent<HTMLElement>, cancel = false) => {
    const current = gestureRef.current;
    if (
      !current ||
      current.kind !== "resize" ||
      current.phase !== "active" ||
      current.pointerId !== event.pointerId
    )
      return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancel) {
      setGesture(null);
      return;
    }
    const updates = current.gesture.subjects.map((subject) => {
      const artboard = ordered.find((candidate) => candidate.canvasId === current.gesture.canvasId);
      const element = artboard ? findCanvasElement(artboard.canvas.root, subject.elementId) : null;
      return resizeElementUpdate({
        subject,
        selectionStart: current.gesture.start,
        requested: current.draft.box,
        element,
        handle: current.gesture.handle,
        zoom: camera.zoom,
      });
    });
    onIntent({ kind: "resize", canvasId: current.gesture.canvasId, updates });
    resizeCommitted.current = true;
    setGesture({
      kind: "resize",
      phase: "settling",
      draft: current.draft,
      afterGeometryRevision: geometrySnapshot.revision,
    });
  };

  const beginRubberband = (event: PointerEvent<HTMLElement>, artId: string | null = null) => {
    if (event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Best effort; the band remains useful while inside the workspace.
    }
    setGesture({
      kind: "rubberband",
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      current: { x: event.clientX, y: event.clientY },
      artId,
      captureTarget: event.currentTarget,
    });
  };

  const updateRubberband = (event: PointerEvent<HTMLElement>) => {
    const current = gestureRef.current;
    if (!current || current.kind !== "rubberband" || current.pointerId !== event.pointerId) return;
    setGesture({ ...current, current: { x: event.clientX, y: event.clientY } });
  };

  const endRubberband = (event: PointerEvent<HTMLElement>) => {
    const current = gestureRef.current;
    if (!current || current.kind !== "rubberband" || current.pointerId !== event.pointerId) return;
    const band: CanvasClientRect = {
      x: Math.min(current.start.x, event.clientX),
      y: Math.min(current.start.y, event.clientY),
      width: Math.abs(event.clientX - current.start.x),
      height: Math.abs(event.clientY - current.start.y),
      right: Math.max(current.start.x, event.clientX),
      bottom: Math.max(current.start.y, event.clientY),
    };
    const target =
      (current.artId ? ordered.find((artboard) => artboard.artId === current.artId) : undefined) ??
      (current.artId
        ? undefined
        : ordered.find(
            (artboard) =>
              geometry.get(artboard.artId) &&
              rectsOverlap(geometry.get(artboard.artId)!.rect, band),
          ));
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
      onIntent({ kind: "select", selection: { artId: target.artId, elementIds: ids } });
      onIntent({ kind: "focus", artId: target.artId, frameBlock: false });
    } else if (band.width < 2 && band.height < 2) {
      onIntent({ kind: "select", selection: { artId: null, elementIds: [] } });
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setGesture(null);
  };

  const beginCreation = (event: PointerEvent<HTMLElement>) => {
    if (tool === "select" || event.button !== 0) return;
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Best effort; the workspace still handles movement inside its bounds.
    }
    setGesture({
      kind: "creation",
      pointerId: event.pointerId,
      tool,
      start: { x: event.clientX, y: event.clientY },
      current: { x: event.clientX, y: event.clientY },
      square: event.shiftKey,
      captureTarget: event.currentTarget,
    });
  };

  const moveCreation = (event: PointerEvent<HTMLElement>) => {
    const current = gestureRef.current;
    if (!current || current.kind !== "creation" || current.pointerId !== event.pointerId) return;
    setGesture({
      ...current,
      current: { x: event.clientX, y: event.clientY },
      square: event.shiftKey,
    });
  };

  const finishCreation = (event: PointerEvent<HTMLElement>, cancel = false) => {
    const current = gestureRef.current;
    if (!current || current.kind !== "creation" || current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setGesture(null);
    if (cancel) {
      onIntent({ kind: "cancel-creation" });
      return;
    }
    const rect = creationRect(
      current.start,
      { x: event.clientX, y: event.clientY },
      current.square || event.shiftKey,
    );
    if (rect.width < 4 || rect.height < 4) return;
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const canvasNodes = [...workspace.querySelectorAll<HTMLElement>("[data-artboard-id]")];
    const canvasTargets = canvasNodes.flatMap((node) => {
      const id = node.dataset.artboardId;
      return id ? [{ id, rect: measuredRect(node) }] : [];
    });
    const artId = canvasForCreation(canvasTargets, rect, { x: event.clientX, y: event.clientY });
    const width = Math.max(1, roundToLogicalPixel(rect.width, camera.zoom));
    const height = Math.max(1, roundToLogicalPixel(rect.height, camera.zoom));
    if (current.tool === "block" && !artId) {
      const bounds = workspace.getBoundingClientRect();
      onIntent({
        kind: "create-block",
        request: {
          sourceCanvasId: null,
          position: {
            x: roundToLogicalPixel(rect.x - bounds.x - camera.x, camera.zoom),
            y: roundToLogicalPixel(rect.y - bounds.y - camera.y, camera.zoom),
          },
          width,
          height,
        },
      });
      return;
    }
    const artboard = ordered.find((candidate) => candidate.artId === artId);
    const canvasNode = canvasNodes.find((node) => node.dataset.artboardId === artId);
    if (!artboard || !canvasNode) {
      onIntent({ kind: "creation-missed-canvas" });
      return;
    }
    const root = canvasNode.querySelector<HTMLElement>("[data-canvas-root]");
    if (!root) return;
    const frames = [
      ...canvasNode.querySelectorAll<HTMLElement>("[data-element-type='frame']"),
    ].flatMap((frame) => {
      const id = frame.dataset.elementId;
      return id ? [{ id, rect: measuredRect(frame) }] : [];
    });
    const parentId = containingFrame(frames, rect) ?? root.dataset.canvasRoot;
    if (!parentId) return;
    const parent = frames.find((frame) => frame.id === parentId);
    if (!parent) return;
    const parentNode = [...canvasNode.querySelectorAll<HTMLElement>("[data-element-id]")].find(
      (element) => element.dataset.elementId === parentId,
    );
    const parentIsAuto = parentNode ? getComputedStyle(parentNode).display === "flex" : false;
    const children = [...canvasNode.querySelectorAll<HTMLElement>("[data-element-parent-id]")]
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
    if (current.tool === "block") {
      onIntent({
        kind: "create-block",
        request: {
          sourceCanvasId: artboard.canvasId,
          position: freeArtboardPosition(ordered, artboard, { width, height }),
          width,
          height,
          slotParentId: parentId,
          slotRank: rank,
          slotProperties: parentIsAuto
            ? undefined
            : {
                anchor: {
                  horizontal: "left",
                  vertical: "top",
                  offsetX: roundToLogicalPixel(rect.x - parent.rect.x, camera.zoom),
                  offsetY: roundToLogicalPixel(rect.y - parent.rect.y, camera.zoom),
                },
              },
        },
      });
      return;
    }
    const id = `element-${globalThis.crypto.randomUUID()}`;
    const element = newElementForCanvasCreation({
      id,
      tool: current.tool,
      rank,
      width,
      height,
      anchor: parentIsAuto
        ? null
        : {
            horizontal: "left",
            vertical: "top",
            offsetX: roundToLogicalPixel(rect.x - parent.rect.x, camera.zoom),
            offsetY: roundToLogicalPixel(rect.y - parent.rect.y, camera.zoom),
          },
    });
    onIntent({
      kind: "create-element",
      artId: artboard.artId,
      canvasId: artboard.canvasId,
      element,
      parentId,
      rank,
    });
  };

  const handleCanvasKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (
      focusContext().inKeyConsumingWidget ||
      !selection.artId ||
      selection.elementIds.length === 0
    )
      return;
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
      const intent = canvasKeyboardIntent(
        frame.direction ?? "vertical",
        event.key,
        event.shiftKey,
        frame.layoutMode === "auto",
        element.alignSelf,
      );
      if (!intent) continue;
      handled = true;
      if (intent.type === "nudge") {
        onIntent({
          kind: "update-element",
          canvasId: artboard.canvasId,
          elementId,
          properties: { anchor: nudgeAnchor(element.anchor, intent.dx, intent.dy) },
        });
      } else if (intent.type === "cross-align") {
        onIntent({
          kind: "update-element",
          canvasId: artboard.canvasId,
          elementId,
          properties: { alignSelf: intent.value },
        });
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
        onIntent({
          kind: "move-element",
          canvasId: artboard.canvasId,
          elementId,
          parentId: frame.id,
          rank: rankForInsertion(
            siblings.map((child) => child.rank ?? ""),
            targetIndex,
          ),
        });
      }
    }
    if (handled) event.preventDefault();
  };

  const beginWorkspaceInteraction = (event: PointerEvent<HTMLElement>) => {
    if (tool !== "select") return;
    beginCameraDrag(event);
    if (event.target === event.currentTarget) beginRubberband(event);
  };
  const moveWorkspaceInteraction = (event: PointerEvent<HTMLElement>) => {
    if (tool !== "select") {
      if (event.target === event.currentTarget) moveCreation(event);
      return;
    }
    moveCameraDrag(event);
    updateResize(event);
    updateRubberband(event);
  };
  const endWorkspaceInteraction = (event: PointerEvent<HTMLElement>) => {
    if (tool !== "select") {
      if (event.target === event.currentTarget) finishCreation(event);
      return;
    }
    endCameraDrag(event);
    finishResize(event);
    endRubberband(event);
  };
  const cancelWorkspaceInteraction = (event: PointerEvent<HTMLElement>) => {
    if (tool !== "select") {
      if (event.target === event.currentTarget) finishCreation(event, true);
      return;
    }
    endCameraDrag(event);
    finishResize(event, true);
    endRubberband(event);
  };

  useLayoutEffect(() => {
    const current = gestureRef.current;
    if (!current || (current.kind !== "element-move" && current.kind !== "resize")) return;
    if (current.phase === "settling" && geometrySnapshot.revision > current.afterGeometryRevision) {
      setGesture(null);
    }
  }, [geometrySnapshot.revision, setGesture]);

  useLayoutEffect(() => {
    if (resizeDraft) {
      const { box, start, subjects } = resizeDraft;
      for (const subject of subjects) {
        const node = workspaceRef.current?.querySelector<HTMLElement>(
          `[data-element-id="${CSS.escape(subject.elementId)}"]`,
        );
        if (!node) continue;
        const previous = resizeStyles.current.get(subject.elementId);
        if (!previous || previous.node !== node)
          resizeStyles.current.set(subject.elementId, { node, cssText: node.style.cssText });
        const original = resizeStyles.current.get(subject.elementId)?.cssText ?? "";
        const next = scaleWithin(subject.start, start, box);
        const translate = subject.autoParent
          ? ""
          : `translate: ${(next.x - subject.start.x) / camera.zoom}px ${(next.y - subject.start.y) / camera.zoom}px;`;
        node.style.cssText = `${original}; width: ${next.width / camera.zoom}px; height: ${next.height / camera.zoom}px; ${translate}`;
      }
      if (subjects.some((subject) => subject.autoParent)) {
        const measured = selectionRect(
          subjects.flatMap((subject) => {
            const node = workspaceRef.current?.querySelector<HTMLElement>(
              `[data-element-id="${CSS.escape(subject.elementId)}"]`,
            );
            return node ? [measuredRect(node)] : [];
          }),
        );
        if (
          measured &&
          (Math.abs(measured.x - resizeDraft.actual.x) > 0.01 ||
            Math.abs(measured.y - resizeDraft.actual.y) > 0.01 ||
            Math.abs(measured.width - resizeDraft.actual.width) > 0.01 ||
            Math.abs(measured.height - resizeDraft.actual.height) > 0.01)
        ) {
          const current = gestureRef.current;
          if (current?.kind === "resize")
            setGesture({ ...current, draft: { ...current.draft, actual: measured } });
        }
      }
      return;
    }
    const committed = resizeCommitted.current;
    for (const { node, cssText } of resizeStyles.current.values()) {
      if (committed) node.style.removeProperty("translate");
      else node.style.cssText = cssText;
    }
    resizeStyles.current.clear();
    resizeCommitted.current = false;
  }, [camera.zoom, resizeDraft, setGesture, workspaceRef]);

  useEffect(
    () => () => {
      for (const { node, cssText } of resizeStyles.current.values()) node.style.cssText = cssText;
      resizeStyles.current.clear();
      resizeCommitted.current = false;
    },
    [],
  );
  useLayoutEffect(() => {
    if (!activeElementMove) return;
    const node = workspaceRef.current?.querySelector<HTMLElement>(
      `[data-element-id="${CSS.escape(activeElementMove.drag.elementId)}"]`,
    );
    if (!node) return;
    const previous = node.style.translate;
    node.style.translate = `${activeElementMove.offset.x / camera.zoom}px ${activeElementMove.offset.y / camera.zoom}px`;
    return () => {
      node.style.translate = previous;
    };
  }, [activeElementMove, camera.zoom, workspaceRef]);

  const liveElementRect =
    liveOffset && workspaceRef.current
      ? (() => {
          const elementId =
            liveOffset.phase === "active" ? liveOffset.drag.elementId : liveOffset.elementId;
          const node = workspaceRef.current.querySelector<HTMLElement>(
            `[data-element-id="${CSS.escape(elementId)}"]`,
          );
          return node ? measuredRect(node) : null;
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
      : liveElementRect
        ? {
            x: liveElementRect.x - workspaceBounds.x,
            y: liveElementRect.y - workspaceBounds.y,
            width: liveElementRect.width,
            height: liveElementRect.height,
          }
        : selectedRect
          ? {
              x: selectedRect.x - workspaceBounds.x + (liveOffset?.offset.x ?? 0),
              y: selectedRect.y - workspaceBounds.y + (liveOffset?.offset.y ?? 0),
              width: selectedRect.width,
              height: selectedRect.height,
            }
          : null
    : null;
  const resizePreview =
    resizeDraft &&
    workspaceBounds &&
    resizeDraft.subjects.length === 1 &&
    selectedGeometry?.rootElementId === resizeDraft.subjects[0]?.elementId
      ? {
          artId: resizeDraft.artId,
          x: (resizeDraft.actual.x - workspaceBounds.x - camera.x) / camera.zoom,
          y: (resizeDraft.actual.y - workspaceBounds.y - camera.y) / camera.zoom,
          width: resizeDraft.actual.width / camera.zoom,
          height: resizeDraft.actual.height / camera.zoom,
        }
      : null;
  const creationOverlayRect =
    gesture?.kind === "creation" && workspaceBounds
      ? (() => {
          const rect = creationRect(gesture.start, gesture.current, gesture.square);
          return {
            x: rect.x - workspaceBounds.x,
            y: rect.y - workspaceBounds.y,
            width: rect.width,
            height: rect.height,
          };
        })()
      : null;
  const dragLine =
    activeElementMove?.preview?.showLine && workspaceBounds
      ? {
          x: activeElementMove.preview.line.x - workspaceBounds.x,
          y: activeElementMove.preview.line.y - workspaceBounds.y,
          width: activeElementMove.preview.line.width,
          height: activeElementMove.preview.line.height,
        }
      : null;
  const rubberbandRect =
    gesture?.kind === "rubberband" && workspaceBounds
      ? {
          x: Math.min(gesture.start.x, gesture.current.x) - workspaceBounds.x,
          y: Math.min(gesture.start.y, gesture.current.y) - workspaceBounds.y,
          width: Math.abs(gesture.current.x - gesture.start.x),
          height: Math.abs(gesture.current.y - gesture.start.y),
        }
      : null;
  const creationPreview = creationOverlayRect
    ? (() => {
        const rect = creationOverlayRect;
        return gesture?.kind === "creation" && gesture.tool === "ellipse"
          ? {
              type: "ellipse" as const,
              cx: rect.x + rect.width / 2,
              cy: rect.y + rect.height / 2,
              rx: rect.width / 2,
              ry: rect.height / 2,
            }
          : { type: "rect" as const, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })()
    : null;
  const { textEdit, textEditRef, beginTextEdit, commitTextEdit, handleTextKeyDown } =
    useCanvasTextEditing({
      ordered,
      workspaceRef,
      onUpdateElement: (canvasId: string, elementId: string, properties: Record<string, unknown>) =>
        onIntent({ kind: "update-element", canvasId, elementId, properties }),
    });
  return (
    <main
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
      ref={workspaceRef}
      style={{
        cursor: resizeDraft
          ? handleCursor(resizeDraft.handle)
          : tool !== "select"
            ? "crosshair"
            : undefined,
        touchAction: "none",
      }}
      aria-label="Canvas workspace"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Escape" && tool !== "select") onIntent({ kind: "cancel-creation" });
        handleCanvasKeyDown(event);
      }}
      onPointerDown={(event) => {
        commitTextEdit();
        if (tool !== "select") beginCreation(event);
        beginWorkspaceInteraction(event);
      }}
      onPointerMove={moveWorkspaceInteraction}
      onPointerUp={endWorkspaceInteraction}
      onPointerCancel={cancelWorkspaceInteraction}
    >
      <div
        className="pointer-events-none absolute top-0 left-0 h-0 w-0"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {ordered.map((artboard) => {
          const measured = artboardSizes.get(artboard.artId);
          const size = measured ?? canvasArtboardSize(artboard);
          const preview = resizePreview?.artId === artboard.artId ? resizePreview : null;
          const moving = gesture?.kind === "artboard-move" && gesture.artId === artboard.artId;
          return (
            <div
              key={artboard.artId}
              role="group"
              className={`pointer-events-auto absolute overflow-hidden bg-background shadow-2xl ${moving ? "cursor-grabbing" : "cursor-default"}`}
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
                cursor: resizeDraft
                  ? handleCursor(resizeDraft.handle)
                  : tool !== "select"
                    ? "crosshair"
                    : moving
                      ? "grabbing"
                      : "default",
                outline: "1px solid var(--border)",
                contain: "layout paint",
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
                  beginCreation(event);
                  return;
                }
                if (event.metaKey || event.ctrlKey) {
                  event.stopPropagation();
                  onIntent({ kind: "focus", artId: artboard.artId, frameBlock: false });
                  onIntent({
                    kind: "select",
                    selection: { artId: artboard.artId, elementIds: [] },
                  });
                  beginRubberband(event, artboard.artId);
                  return;
                }
                if (beginElementDrag(event, artboard)) return;
                onIntent({
                  kind: "focus",
                  artId: artboard.artId,
                  frameBlock: artboard.kind === "block",
                });
                const element = authoredElementForSelection(
                  artboard.kind === "block"
                    ? topmostElementAtPoint(event.currentTarget, event.clientX, event.clientY)
                    : topmostPaintedElementAtPoint(
                        event.currentTarget,
                        event.clientX,
                        event.clientY,
                        event.altKey,
                      ),
                  event.currentTarget,
                  artboard.canvas.root,
                );
                onIntent({
                  kind: "select",
                  selection: {
                    artId: artboard.artId,
                    elementIds: element?.dataset.elementId
                      ? toggleSelection(
                          selection.artId === artboard.artId ? selection.elementIds : [],
                          element.dataset.elementId,
                          event.shiftKey,
                        )
                      : [],
                  },
                });
                beginDrag(event, artboard);
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
                  textElement?.closest<HTMLElement>("[data-artboard-id]") !== event.currentTarget ||
                  textElement?.closest<HTMLElement>("[data-element-type='slot']")
                )
                  return;
                if (textElement.dataset.elementId)
                  beginTextEdit(textElement.dataset.elementId, event);
              }}
              onPointerMove={(event) => {
                updateElementDrag(event);
                updateRubberband(event);
                moveDrag(event, artboard);
                moveCreation(event);
              }}
              onPointerUp={(event) => {
                finishElementDrag(event);
                endRubberband(event);
                endDrag(event);
                finishCreation(event);
              }}
              onPointerCancel={(event) => {
                finishElementDrag(event, true);
                endRubberband(event);
                endDrag(event, true);
                finishCreation(event, true);
              }}
            >
              {artboard.renderPresentation ? (
                <CanvasRenderer
                  presentation={artboard.renderPresentation}
                  editingElementId={textEdit?.artId === artboard.artId ? textEdit.elementId : null}
                  onTextDoubleClick={beginTextEdit}
                  onTextKeyDown={handleTextKeyDown}
                />
              ) : null}
            </div>
          );
        })}
      </div>
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
                className={`size-3.5 shrink-0 ${active ? "text-foreground" : "text-muted-foreground"}`}
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
                      event.currentTarget.value = artboard.name;
                      event.currentTarget.blur();
                    }
                  }}
                  onBlur={(event) => {
                    const name = event.currentTarget.value.trim();
                    if (name && name !== artboard.name)
                      onIntent({ kind: "rename-artboard", artId: artboard.artId, name });
                    onRenamingArtIdChange(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={`cursor-grab truncate active:cursor-grabbing ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                  onPointerDown={(event) => beginDrag(event, artboard)}
                  onPointerMove={(event) => moveDrag(event, artboard)}
                  onPointerUp={(event) => endDrag(event)}
                  onPointerCancel={(event) => endDrag(event, true)}
                  onClick={() => {
                    onIntent({
                      kind: "focus",
                      artId: artboard.artId,
                      frameBlock: artboard.kind === "block",
                    });
                    onIntent({
                      kind: "select",
                      selection: { artId: artboard.artId, elementIds: [] },
                    });
                  }}
                  onDoubleClick={() => onRenamingArtIdChange(artboard.artId)}
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
            {
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
            }
            {selectedIds.length > 0 &&
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

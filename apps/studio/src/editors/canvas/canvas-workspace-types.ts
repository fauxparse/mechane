import type { ImageInputOnUploadProps } from "@mechane/design-system";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent, RefObject } from "react";

import type { NewElement } from "@mechane/commands";
import type { SceneVariable, Position } from "@mechane/domain";
import type { ImageAsset } from "@mechane/graphql-schema";
import type { CanvasArtboardDocument } from "../../api/canvas";
import type { CanvasCamera } from "./components/canvas-camera";
import type { CanvasSelection } from "./components/canvas-selection";
import type { ResizeHandle } from "./commands/canvas-resize";
import type { CanvasTool } from "./Toolbar/Toolbar";

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
  onCameraChange?(camera: CanvasCamera): void;
  onCreateElement?(canvasId: string, element: NewElement, parentId: string, rank: string): void;
  onMoveElement?(
    canvasId: string,
    elementId: string,
    parentId: string,
    rank: string,
    properties?: Record<string, unknown>,
    unsetProperties?: readonly string[],
  ): void;
  onMoveElementBetweenCanvases?(
    sourceCanvasId: string,
    targetCanvasId: string,
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
  onUpdateElements?(
    canvasId: string,
    updates: readonly {
      readonly elementId: string;
      readonly properties: Record<string, unknown>;
      readonly unsetProperties?: readonly string[];
    }[],
  ): void;
  variables?: readonly SceneVariable[];
  imageAssets?: readonly ImageAsset[];
  onImageUpload?(props: ImageInputOnUploadProps): void;
  onDeleteElements?(canvasId: string, elementIds: readonly string[]): void;
  onRenameArtboard?(artId: string, name: string): void;
}

export interface CanvasWorkspaceSurfaceProps {
  ordered: readonly CanvasArtboardDocument[];
  focused: CanvasArtboardDocument | null;
  camera: CanvasCamera;
  workspaceRef: RefObject<HTMLElement | null>;
  selection: CanvasSelection;
  tool: CanvasTool;
  setTool(tool: CanvasTool): void;
  renamingArtId: string | null;
  setRenamingArtId(artId: string | null): void;
  drag: {
    artId: string;
    canvasId: string;
    pointerId: number;
    origin: { x: number; y: number };
    start: { x: number; y: number };
  } | null;
  dragLine: { x: number; y: number; width: number; height: number } | null;
  rubberbandRect: { x: number; y: number; width: number; height: number } | null;
  creationOverlayRect: { x: number; y: number; width: number; height: number } | null;
  overlayRect: { x: number; y: number; width: number; height: number } | null;
  resizePreview: {
    artId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  resizeCursor: string | null;
  inspectorPreview: {
    elementId: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  } | null;
  currentDimensions: {
    elementId: string;
    width: number;
    height: number;
  } | null;
  resizable: boolean;
  onCancelCreation(): void;
  zoomIn(): void;
  zoomOut(): void;
  resetCamera(): void;
  frameArtboard(artboard: CanvasArtboardDocument): void;
  onFocusArtboard(artId: string): void;
  onUpdateElement?(
    canvasId: string,
    elementId: string,
    properties: Record<string, unknown>,
    unsetProperties?: readonly string[],
  ): void;
  onUpdateElements?(
    canvasId: string,
    updates: readonly {
      readonly elementId: string;
      readonly properties: Record<string, unknown>;
      readonly unsetProperties?: readonly string[];
    }[],
  ): void;
  variables?: readonly SceneVariable[];
  imageAssets?: readonly ImageAsset[];
  onImageUpload?(props: ImageInputOnUploadProps): void;
  onMoveElement?(
    canvasId: string,
    elementId: string,
    parentId: string,
    rank: string,
    properties?: Record<string, unknown>,
    unsetProperties?: readonly string[],
  ): void;
  onMoveElementBetweenCanvases?(
    sourceCanvasId: string,
    targetCanvasId: string,
    elementId: string,
    parentId: string,
    rank: string,
    properties?: Record<string, unknown>,
    unsetProperties?: readonly string[],
  ): void;
  onRenameArtboard?(artId: string, name: string): void;
  onSelect(selection: CanvasSelection): void;
  onBeginDrag(event: PointerEvent<HTMLElement>, artboard: CanvasArtboardDocument): void;
  onMoveDrag(event: PointerEvent<HTMLElement>, artboard: CanvasArtboardDocument): void;
  onEndDrag(event: PointerEvent<HTMLElement>, cancel?: boolean): void;
  onBeginElementDrag(event: PointerEvent<HTMLElement>, artboard: CanvasArtboardDocument): boolean;
  onUpdateElementDrag(event: PointerEvent<HTMLElement>): void;
  onFinishElementDrag(event: PointerEvent<HTMLElement>, cancel?: boolean): void;
  onBeginRubberband(event: PointerEvent<HTMLElement>, artId?: string | null): void;
  onUpdateRubberband(event: PointerEvent<HTMLElement>): void;
  onEndRubberband(event: PointerEvent<HTMLElement>): void;
  onBeginWorkspaceInteraction(event: PointerEvent<HTMLElement>): void;
  onMoveWorkspaceInteraction(event: PointerEvent<HTMLElement>): void;
  onEndWorkspaceInteraction(event: PointerEvent<HTMLElement>): void;
  onCancelWorkspaceInteraction(event: PointerEvent<HTMLElement>): void;
  onBeginCreation(event: PointerEvent<HTMLElement>, artboard: CanvasArtboardDocument | null): void;
  onMoveCreation(event: PointerEvent<HTMLElement>): void;
  onFinishCreation(event: PointerEvent<HTMLElement>, cancel?: boolean): void;
  onSelectAtPoint(event: PointerEvent<HTMLElement>, artboard: CanvasArtboardDocument): void;
  onBeginResize(event: PointerEvent<SVGElement>, handle: ResizeHandle): void;
  onHandleCanvasKeyDown(event: ReactKeyboardEvent<HTMLElement>): void;
}

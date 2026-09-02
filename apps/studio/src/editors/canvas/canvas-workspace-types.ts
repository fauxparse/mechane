import type { ImageInputOnUploadProps } from "@mechane/design-system";

import type { NewElement } from "@mechane/commands";
import type {
  Action,
  Block,
  Cue,
  EventBinding,
  ImageAssetReference,
  InteractionOwner,
  Position,
  ResolvedImageValue,
  SceneVariable,
  Shape,
} from "@mechane/domain";
import type { ImageAsset } from "@mechane/graphql-schema";
import type { CanvasArtboardDocument } from "../../api/canvas";
import type { VariableInspectorEditing } from "../../components/VariableInspector";
import type { CanvasCamera } from "./components/canvas-camera";
import type { CanvasSelection } from "./components/canvas-selection";
export type DeviceQrImage = ResolvedImageValue & Pick<ImageAssetReference, "revision">;

export interface CanvasBlockCreationRequest {
  readonly sourceCanvasId: string | null;
  readonly position: Position;
  readonly width: number;
  readonly height: number;
  readonly slotParentId?: string;
  readonly slotRank?: string;
  readonly slotProperties?: Record<string, unknown>;
}
export interface CanvasBlockCreationResult {
  readonly canvasId: string;
  readonly position: Position;
  readonly width: number;
  readonly height: number;
}

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
  shapes?: readonly Shape[];
  blocks?: readonly Block[];
  blockVariableEditing?: VariableInspectorEditing;
  onPlaceBlock?(blockId: string): void;
  onCreateBlockFromDrag?(
    request: CanvasBlockCreationRequest,
  ): CanvasBlockCreationResult | null | undefined;
  /** Replaces the selection with a Slot holding a new Block made from it (#426). */
  onCreateBlockFromSelection?(
    canvasId: string,
    elementIds: readonly string[],
  ): CanvasBlockCreationResult | null | undefined;
  imageAssets?: readonly ImageAsset[];
  deviceQrImages?: Readonly<Record<string, DeviceQrImage>>;
  onImageUpload?(props: ImageInputOnUploadProps): void;
  onDeleteElements?(canvasId: string, elementIds: readonly string[]): void;
  cues?: readonly Cue[];
  actions?: readonly Action[];
  eventBindings?: readonly EventBinding[];
  onCreateCue?(owner: InteractionOwner): void;
  onFocusCue?(cueId: string): void;
  onSetEventBindingCue?(bindingId: string, cueId: string): void;
  onCreateEventBinding?(binding: EventBinding): void;
  onRemoveEventBinding?(bindingId: string): void;
  onReorderEventBindings?(bindingIds: readonly string[]): void;
  onRenameArtboard?(artId: string, name: string): void;
}
export interface CanvasArtboardDimensions {
  readonly width: number;
  readonly height: number;
}

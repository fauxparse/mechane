import type { ImageInputOnUploadProps } from "@mechane/design-system";

import type { NewElement } from "@mechane/commands";
import type { Block } from "@mechane/domain/blocks";
import type { Position, SceneVariable } from "@mechane/domain/graph";
import type { Action, Cue, EventBinding, InteractionOwner } from "@mechane/domain/interactions";
import type { ImageAssetReference, ResolvedImageValue, Shape } from "@mechane/domain/shapes";
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
  selectedArtId?: string | null;
  selectedElementIds?: readonly string[];
  initialCamera?: CanvasCamera;
  /** A remembered selection, restored against `artboards` when the editor mounts. */
  initialSelection?: CanvasSelection;
  variables?: readonly SceneVariable[];
  shapes?: readonly Shape[];
  blocks?: readonly Block[];
  blockVariableEditing?: VariableInspectorEditing;
  imageAssets?: readonly ImageAsset[];
  deviceQrImages?: Readonly<Record<string, DeviceQrImage>>;
  cues?: readonly Cue[];
  actions?: readonly Action[];
  eventBindings?: readonly EventBinding[];
  /** Every mutation the editor can cause, in domain terms. */
  readonly session: CanvasWorkspaceSession;
}
export interface CanvasArtboardDimensions {
  readonly width: number;
  readonly height: number;
}
export interface CanvasWorkspaceSession {
  readonly canvas: {
    focusArtboard(artId: string): void;
    selectionChange?(selection: CanvasSelection): void;
    beginMoveArtboard(canvasId: string): void;
    moveArtboard(canvasId: string, position: Position): void;
    endMoveArtboard(canvasId: string, cancel?: boolean): void;
    createElement(canvasId: string, element: NewElement, parentId: string, rank: string): void;
    moveElement?(
      canvasId: string,
      elementId: string,
      parentId: string,
      rank: string,
      properties?: Record<string, unknown>,
      unsetProperties?: readonly string[],
    ): void;
    moveElementBetweenCanvases?(
      sourceCanvasId: string,
      targetCanvasId: string,
      elementId: string,
      parentId: string,
      rank: string,
      properties?: Record<string, unknown>,
      unsetProperties?: readonly string[],
    ): void;
    updateElement?(
      canvasId: string,
      elementId: string,
      properties: Record<string, unknown>,
      unsetProperties?: readonly string[],
    ): void;
    updateElements?(
      canvasId: string,
      updates: readonly {
        readonly elementId: string;
        readonly properties: Record<string, unknown>;
        readonly unsetProperties?: readonly string[];
      }[],
    ): void;
    placeBlock?(blockId: string): void;
    createBlockFromDrag?(
      request: CanvasBlockCreationRequest,
    ): CanvasBlockCreationResult | null | undefined;
    createBlockFromSelection?(
      canvasId: string,
      elementIds: readonly string[],
    ): CanvasBlockCreationResult | null | undefined;
    deleteElements?(canvasId: string, elementIds: readonly string[]): void;
    renameArtboard?(artId: string, name: string): void;
  };
  readonly graph: {
    createCue?(owner: InteractionOwner): string | undefined;
    focusCue?(cueId: string): void;
    setEventBindingCue?(bindingId: string, cueId: string): void;
    setEventBindingKey?(bindingId: string, key: string | null): void;
    createEventBinding?(binding: EventBinding): void;
    removeEventBinding?(bindingId: string): void;
    reorderEventBindings?(bindingIds: readonly string[]): void;
  };
  readonly assets: {
    imageUpload?(props: ImageInputOnUploadProps): void;
  };
  readonly camera: {
    change?(camera: CanvasCamera): void;
  };
}

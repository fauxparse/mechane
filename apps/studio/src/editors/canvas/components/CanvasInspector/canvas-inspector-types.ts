import type { ImageInputOnUploadProps } from "@mechane/design-system";
import type {
  Action,
  Block,
  Cue,
  Element,
  EventBinding,
  InteractionOwner,
  SceneVariable,
  Shape,
} from "@mechane/domain";
import type { ImageAsset } from "@mechane/graphql-schema";

import type { CanvasArtboardDocument } from "../../../../api/canvas";
import type { VariableInspectorEditing } from "../../../../components/VariableInspector";
import type { DeviceQrImage } from "../../canvas-workspace-types";
import type { CanvasSelection } from "../canvas-selection";

export type CanvasInspectorPreview = {
  elementId: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type CanvasInspectorDimensions = {
  elementId: string;
  width: number;
  height: number;
};

export type CanvasInspectorUpdate = (
  properties: Record<string, unknown>,
  unset?: readonly string[],
) => void;

export type CanvasInspectorProps = {
  focused: CanvasArtboardDocument | null;
  artboards: readonly CanvasArtboardDocument[];
  selection: CanvasSelection;
  variables?: readonly SceneVariable[];
  blocks?: readonly Block[];
  shapes?: readonly Shape[];
  cues?: readonly Cue[];
  actions?: readonly Action[];
  eventBindings?: readonly EventBinding[];
  imageAssets?: readonly ImageAsset[];
  deviceQrImages?: Readonly<Record<string, DeviceQrImage>>;
  onImageUpload?(props: ImageInputOnUploadProps): void;
  onCreateCue?(owner: InteractionOwner): void;
  onFocusCue?(cueId: string): void;
  onSetEventBindingCue?(bindingId: string, cueId: string): void;
  onCreateEventBinding?(binding: EventBinding): void;
  onRemoveEventBinding?(bindingId: string): void;
  inspectorPreview?: CanvasInspectorPreview | null;
  currentDimensions?: CanvasInspectorDimensions | null;
  blockVariableEditing?: VariableInspectorEditing;
  onRenameArtboard?(artId: string, name: string): void;
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
};

export type CanvasInspectorModel = {
  focused: CanvasArtboardDocument | null;
  target: Element;
  elements: readonly Element[];
  selected: readonly Element[];
  blocks: readonly Block[];
  variables: readonly SceneVariable[];
  shapes: readonly Shape[];
  cues?: readonly Cue[];
  actions?: readonly Action[];
  eventBindings?: readonly EventBinding[];
  deviceQrImages: Readonly<Record<string, DeviceQrImage>>;
  imageAssets: readonly ImageAsset[];
  onImageUpload?(props: ImageInputOnUploadProps): void;
  onCreateCue?(owner: InteractionOwner): void;
  onFocusCue?(cueId: string): void;
  onSetEventBindingCue?(bindingId: string, cueId: string): void;
  onCreateEventBinding?(binding: EventBinding): void;
  onRemoveEventBinding?(bindingId: string): void;
  onRenameArtboard?(artId: string, name: string): void;
  blockVariableEditing?: VariableInspectorEditing;
  fontFamilies: readonly string[];
  inspectorPreview: CanvasInspectorPreview | null;
  currentDimensions: CanvasInspectorDimensions | null;
  absolute: boolean;
  common(property: string): unknown;
  update: CanvasInspectorUpdate;
  text(property: string, fallback?: string): string;
  isAspectRatioLocked: boolean;
  setAspectRatioLock(locked: boolean): void;
};

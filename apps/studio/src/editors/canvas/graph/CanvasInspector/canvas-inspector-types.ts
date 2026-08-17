import type { Element, SceneVariable } from "@mechane/domain";

import type { CanvasArtboardDocument } from "../../../../api/canvas";
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
  inspectorPreview?: CanvasInspectorPreview | null;
  currentDimensions?: CanvasInspectorDimensions | null;
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
  variables: readonly SceneVariable[];
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

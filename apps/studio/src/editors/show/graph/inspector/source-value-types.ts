import type { ImageInputOnUploadProps } from "@mechane/design-system";
import type { ImageAssetReference, ResolvedImageValue, Shape, Type } from "@mechane/domain/shapes";
import type { ReactNode } from "react";

export type SourceImageAsset = ResolvedImageValue &
  Pick<ImageAssetReference, "revision"> & {
    name?: string;
  };

export type SourceValueRow = {
  label: string;
  fieldPath: readonly string[];
  type: Type;
  value: unknown;
  hasOverride: boolean;
};

export type ErrorPath = readonly (string | number)[];

export type ValueEditorProps = {
  type: Type;
  value: unknown;
  shapes: readonly Shape[];
  path: ErrorPath;
  readOnly?: boolean;
  onChange: (value: unknown) => void;
  onValidityChange: (path: ErrorPath, error: string | null) => void;
  imageAssets?: readonly SourceImageAsset[];
  onImageUpload?: (props: ImageInputOnUploadProps) => void;
};

export type ValueEditorRenderer = (props: ValueEditorProps) => ReactNode;

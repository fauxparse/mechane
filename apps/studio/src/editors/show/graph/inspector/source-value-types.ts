import type { ImageInputOnUploadProps } from "@mechane/design-system";
import type { ReactNode } from "react";

import type { ImageAssetReference, ResolvedImageValue, Shape, Type } from "@mechane/domain";

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
  onChange: (value: unknown) => void;
  onValidityChange: (path: ErrorPath, error: string | null) => void;
  imageAssets?: readonly (ResolvedImageValue & Pick<ImageAssetReference, "revision">)[];
  onImageUpload?: (props: ImageInputOnUploadProps) => void;
};

export type ValueEditorRenderer = (props: ValueEditorProps) => ReactNode;

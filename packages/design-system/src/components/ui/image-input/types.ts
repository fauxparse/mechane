import type {
  ImageUploadErrorCode,
  ImageValue,
  ResolvedImageValue,
  VariableReference,
} from "@mechane/domain";

export type ImageInputValue = ResolvedImageValue | VariableReference<ImageValue>;

export type ImageInputErrorCode =
  | ImageUploadErrorCode
  | "FILE_TYPE_UNSUPPORTED"
  | "INVALID_IMAGE"
  | "UPLOAD_UNAVAILABLE"
  | "TRANSFORM_FAILED";

export type ImageInputError = {
  code: ImageInputErrorCode;
  message: string;
  cause?: unknown;
};

export type ImageInputOnUploadProps = {
  file: File;
  signal: AbortSignal;
  onProgress: (progress: number) => void;
  onSuccess: (value: ResolvedImageValue) => void;
  onError: (error: ImageInputError) => void;
};

export type ImageInputValidation = {
  maxSourceBytes?: number;
  maxPixels?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
};

export type ImageInputDimensions = {
  width: number;
  height: number;
};

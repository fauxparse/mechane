import { isResolvedImageValue, type ResolvedImageValue } from "@mechane/domain";
import {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";

import { Alert, AlertDescription } from "../alert";
import { Button } from "../button";
import { cn } from "../../../lib/utils";
import { ImageUploadIcon } from "./ImageUploadIcon";
import { ImageCropper } from "./ImageCropper";
import type { ImageInputCrop } from "./crop-types";
import { ACCEPTED_IMAGE_ACCEPT } from "./utils";
import { validateImageFile } from "./validation";
import type {
  ImageInputError,
  ImageInputErrorCode,
  ImageInputOnUploadProps,
  ImageInputValue,
  ImageInputValidation,
} from "./types";

export type {
  ImageInputError,
  ImageInputErrorCode,
  ImageInputOnUploadProps,
  ImageInputValue,
  ImageInputValidation,
} from "./types";
export type { ImageInputCrop } from "./crop-types";

export type ImageInputProps = {
  className?: string;
  value: ImageInputValue | null;
  readOnly?: boolean;
  validation?: ImageInputValidation;
  crop?: ImageInputCrop;
  onChange: (value: ImageInputValue | null) => void;
  onDelete?: () => void;
  onError?: (error: ImageInputError) => void;
  onUpload?: (props: ImageInputOnUploadProps) => void;
};

type ImageInputState = {
  phase: "idle" | "loading";
  isValidating: boolean;
  progress: number;
  previewFile: File | null;
  previewUrl: string | null;
  error: ImageInputError | null;
  isDragging: boolean;
  cropOpen: boolean;
  cropSource: File | string | null;
};

type ImageInputAction =
  | { type: "begin-validation" }
  | { type: "validation-complete"; file: File }
  | { type: "preview-url"; url: string }
  | { type: "progress"; value: number }
  | { type: "dragging"; value: boolean }
  | { type: "open-crop"; source: File | string }
  | { type: "close-crop" }
  | { type: "error"; error: ImageInputError }
  | { type: "success" };

const initialImageInputState: ImageInputState = {
  phase: "idle",
  isValidating: false,
  progress: 0,
  previewFile: null,
  previewUrl: null,
  error: null,
  isDragging: false,
  cropOpen: false,
  cropSource: null,
};

const imageInputReducer = (state: ImageInputState, action: ImageInputAction): ImageInputState => {
  switch (action.type) {
    case "begin-validation":
      return {
        ...state,
        phase: "loading",
        isValidating: true,
        progress: 0,
        previewFile: null,
        previewUrl: null,
        error: null,
        cropOpen: false,
        cropSource: null,
      };
    case "validation-complete":
      return { ...state, isValidating: false, previewFile: action.file, previewUrl: null };
    case "preview-url":
      return { ...state, previewUrl: action.url };
    case "progress":
      return { ...state, progress: Math.min(100, Math.max(0, action.value)) };
    case "dragging":
      return { ...state, isDragging: action.value };
    case "open-crop":
      return {
        ...state,
        phase: "idle",
        isValidating: false,
        cropOpen: true,
        cropSource: action.source,
      };
    case "close-crop":
      return { ...state, cropOpen: false, cropSource: null };
    case "error":
      return {
        ...state,
        phase: "idle",
        isValidating: false,
        previewFile: null,
        previewUrl: null,
        error: action.error,
        cropOpen: false,
        cropSource: null,
      };
    case "success":
      return {
        ...state,
        phase: "idle",
        isValidating: false,
        previewFile: null,
        previewUrl: null,
        error: null,
        cropOpen: false,
        cropSource: null,
      };
  }
};

const errorFromUnknown = (
  value: unknown,
  fallbackCode: ImageInputErrorCode,
  fallbackMessage: string,
): ImageInputError => {
  if (typeof value === "object" && value !== null && "code" in value && "message" in value) {
    return value as ImageInputError;
  }
  return { code: fallbackCode, message: fallbackMessage, cause: value };
};

export const ImageInput = ({
  className,
  value,
  readOnly = false,
  validation,
  crop,
  onChange,
  onDelete,
  onError,
  onUpload,
}: ImageInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const validationRequestRef = useRef(0);
  const [imageState, dispatch] = useReducer(imageInputReducer, initialImageInputState);
  const dragDepthRef = useRef(0);

  const resolvedValue = isResolvedImageValue(value) ? value : null;
  const isBusy = imageState.phase === "loading" || imageState.cropOpen;

  useEffect(() => {
    if (!imageState.previewFile) return;

    const url = URL.createObjectURL(imageState.previewFile);
    dispatch({ type: "preview-url", url });

    return () => URL.revokeObjectURL(url);
  }, [imageState.previewFile]);

  const reportError = useCallback(
    (nextError: ImageInputError) => {
      dispatch({ type: "error", error: nextError });
      onError?.(nextError);
    },
    [onError],
  );

  const handleUploadProgress = useCallback((nextProgress: number) => {
    dispatch({ type: "progress", value: nextProgress });
  }, []);

  const handleUploadSuccess = useCallback(
    (nextValue: ResolvedImageValue) => {
      dispatch({ type: "success" });
      onChange(nextValue);
    },
    [onChange],
  );

  const handleUploadError = useCallback(
    (uploadError: ImageInputError) => {
      reportError(uploadError);
    },
    [reportError],
  );

  const uploadValidatedFile = (file: File, requestId: number) => {
    if (validationRequestRef.current !== requestId || !onUpload) return;
    dispatch({ type: "validation-complete", file });
    try {
      onUpload({
        file,
        onProgress: handleUploadProgress,
        onSuccess: handleUploadSuccess,
        onError: handleUploadError,
      });
    } catch (uploadError) {
      reportError(
        errorFromUnknown(uploadError, "NETWORK_FAILURE", "The image upload could not be started."),
      );
    }
  };

  const startUpload = async (file: File, skipCrop = false) => {
    if (readOnly || !onUpload) return;
    const requestId = ++validationRequestRef.current;
    dispatch({ type: "begin-validation" });

    try {
      await validateImageFile(file, validation);
    } catch (validationError) {
      if (validationRequestRef.current !== requestId) return;
      reportError(
        errorFromUnknown(
          validationError,
          "INVALID_IMAGE",
          "The selected file could not be used as an image.",
        ),
      );
      return;
    }

    if (validationRequestRef.current !== requestId) return;
    if (crop && !skipCrop) {
      dispatch({ type: "open-crop", source: file });
      return;
    }
    uploadValidatedFile(file, requestId);
  };

  const handleCropComplete = (file: File) => {
    dispatch({ type: "close-crop" });
    void startUpload(file, true);
  };

  const handleCropCancel = () => {
    dispatch({ type: "close-crop" });
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) void startUpload(file);
    event.currentTarget.value = "";
  };

  const resetDragState = () => {
    dragDepthRef.current = 0;
    dispatch({ type: "dragging", value: false });
  };

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (
      readOnly ||
      isBusy ||
      !onUpload ||
      !Array.from(event.dataTransfer.types).includes("Files")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    dispatch({ type: "dragging", value: true });
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (
      readOnly ||
      isBusy ||
      !onUpload ||
      !Array.from(event.dataTransfer.types).includes("Files")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (readOnly || !Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) resetDragState();
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (readOnly || isBusy || !onUpload) return;
    event.preventDefault();
    event.stopPropagation();
    resetDragState();
    const file = event.dataTransfer.files[0];
    if (file) void startUpload(file);
  };

  const handleEdit = () => {
    if (!crop || !resolvedValue || readOnly || !onUpload) return;
    dispatch({ type: "open-crop", source: resolvedValue.url });
  };

  return (
    <>
      <div
        className={cn(
          "group/input relative w-full aspect-video rounded-md grid overflow-hidden *:col-start-1 *:row-start-1",
          className,
        )}
        data-empty={!value && !imageState.previewUrl}
        data-state={imageState.phase}
        data-dragging={imageState.isDragging || undefined}
        aria-readonly={readOnly || undefined}
      >
        <img
          src={imageState.previewUrl ?? resolvedValue?.url}
          alt={resolvedValue?.alt ?? "Image preview"}
          className="group-data-[empty=true]/input:hidden group-data-[state=loading]/input:block size-full min-h-0 min-w-0 object-cover rounded-[inherit] group-data-[state=loading]/input:opacity-100 group-data-[state=loading]/input:blur-(--progress-blur) transition-all"
          style={
            {
              "--progress-blur": `${Math.round((100 - imageState.progress) / 2)}px`,
            } as CSSProperties
          }
        />
        <div
          className="relative z-1 flex w-full h-full flex-col items-center justify-center gap-4 p-4 rounded-[inherit] bg-muted/50 border border-dashed border-transparent group-data-[empty=false]/input:opacity-0 group-data-[empty=false]/input:backdrop-blur-sm group-data-[empty=false]/input:backdrop-saturate-25 group-data-[empty=false]/input:backdrop-brightness-50 hover:opacity-100 group-data-[state=loading]/input:opacity-100 group-data-[dragging=true]/input:border-foreground group-data-[dragging=true]/input:opacity-100 transition-opacity duration-500 hover:duration-300"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <ImageUploadIcon state={imageState.phase} progress={imageState.progress} />
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            aria-label="Choose image file"
            accept={ACCEPTED_IMAGE_ACCEPT}
            onChange={handleFileInputChange}
            disabled={readOnly || isBusy || !onUpload}
          />
          <Button
            type="button"
            variant="outline"
            className="group-data-[empty=false]/input:border-foreground group-data-[empty=false]/input:hover:border-foreground disabled:border-transparent"
            onClick={() => inputRef.current?.click()}
            disabled={readOnly || isBusy || !onUpload}
          >
            {imageState.isValidating ? "Checking..." : isBusy ? "Uploading..." : "Browse files"}
          </Button>
          {crop && resolvedValue && !isBusy && !readOnly && onUpload && (
            <Button type="button" variant="secondary" onClick={handleEdit}>
              <PencilIcon className="size-4" />
              Edit
            </Button>
          )}
          {onDelete && value && !isBusy && !readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-2 group-data-[empty=true]/input:hidden rounded-full bg-neutral-900/50 hover:bg-neutral-900/75 dark:bg-neutral-900/50 dark:hover:bg-neutral-900/75 fg-neutral-100"
              onClick={onDelete}
            >
              <Trash2Icon className="size-4" />
            </Button>
          )}
        </div>
        {imageState.error && (
          <Alert
            variant="destructive"
            className="absolute inset-x-2 bottom-2 z-3 w-auto py-2 text-xs"
          >
            <AlertDescription>{imageState.error.message}</AlertDescription>
          </Alert>
        )}
      </div>
      <ImageCropper
        open={imageState.cropOpen}
        source={imageState.cropSource}
        aspectRatio={crop?.aspectRatio}
        outputWidth={crop?.outputWidth}
        outputHeight={crop?.outputHeight}
        fileName={imageState.cropSource instanceof File ? imageState.cropSource.name : undefined}
        fileType={imageState.cropSource instanceof File ? imageState.cropSource.type : undefined}
        onCancel={handleCropCancel}
        onComplete={handleCropComplete}
        onError={reportError}
      />
    </>
  );
};

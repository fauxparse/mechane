import {
  isResolvedImageValue,
  type ImageValue,
  type ResolvedImageValue,
  type VariableReference,
} from "@mechane/domain";
import { ChangeEvent, DragEvent, useCallback, useEffect, useReducer, useRef } from "react";

import { validateImageFile } from "./validation";
import type { ImageInputCrop } from "./crop-types";
import type {
  ImageInputError,
  ImageInputErrorCode,
  ImageInputOnUploadProps,
  ImageInputValue,
  ImageInputValidation,
} from "./types";

export type UseImageInputControllerProps = {
  value: ImageInputValue | null;
  variables: VariableReference<ImageValue>[];
  imageAssets: readonly ResolvedImageValue[];
  readOnly: boolean;
  validation?: ImageInputValidation;
  crop?: ImageInputCrop;
  onChange: (value: ImageInputValue | null) => void;
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
  cropSession: number;
  variablesOpen: boolean;
  variableQuery: string;
};

type ImageInputAction =
  | { type: "begin-validation" }
  | { type: "validation-complete"; file: File }
  | { type: "preview-url"; url: string }
  | { type: "progress"; value: number }
  | { type: "dragging"; value: boolean }
  | { type: "open-crop"; source: File | string }
  | { type: "close-crop" }
  | { type: "open-variables" }
  | { type: "close-variables" }
  | { type: "variable-query"; query: string }
  | { type: "cancel" }
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
  cropSession: 0,
  variablesOpen: false,
  variableQuery: "",
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
        variablesOpen: false,
        variableQuery: "",
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
        cropSession: state.cropSession + 1,
      };
    case "close-crop":
      return { ...state, cropOpen: false, cropSource: null };
    case "open-variables":
      return { ...state, variablesOpen: true, variableQuery: "" };
    case "close-variables":
      return { ...state, variablesOpen: false, variableQuery: "" };
    case "variable-query":
      return { ...state, variableQuery: action.query };
    case "cancel":
      return {
        ...state,
        phase: "idle",
        isValidating: false,
        previewFile: null,
        previewUrl: null,
        error: null,
        cropOpen: false,
        cropSource: null,
        variablesOpen: false,
        variableQuery: "",
      };
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
        variablesOpen: false,
        variableQuery: "",
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

export const useImageInputController = ({
  value,
  variables,
  imageAssets,
  readOnly,
  validation,
  crop,
  onChange,
  onError,
  onUpload,
}: UseImageInputControllerProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const validationRequestRef = useRef(0);
  const [imageState, dispatch] = useReducer(imageInputReducer, initialImageInputState);
  const dragDepthRef = useRef(0);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const activeUploadRequestRef = useRef<number | null>(null);

  const linkedVariable = value && !isResolvedImageValue(value) ? value : null;
  const linkedAssetId =
    linkedVariable?.current?.kind === "image" ? linkedVariable.current.value.assetId : null;
  const resolvedValue = isResolvedImageValue(value)
    ? value
    : linkedAssetId
      ? (imageAssets.find((asset) => asset.assetId === linkedAssetId) ?? null)
      : null;
  const variableQuery = imageState.variableQuery.trim().toLocaleLowerCase();
  const filteredVariables = variables.filter((variable) =>
    variable.name.toLocaleLowerCase().includes(variableQuery),
  );
  const isBusy = imageState.phase === "loading" || imageState.cropOpen;

  useEffect(() => {
    if (!imageState.previewFile) return;

    const url = URL.createObjectURL(imageState.previewFile);
    dispatch({ type: "preview-url", url });

    return () => URL.revokeObjectURL(url);
  }, [imageState.previewFile]);

  const reportError = useCallback(
    (nextError: ImageInputError) => {
      uploadControllerRef.current = null;
      activeUploadRequestRef.current = null;
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
      if (uploadControllerRef.current?.signal.aborted) return;
      uploadControllerRef.current = null;
      activeUploadRequestRef.current = null;
      dispatch({ type: "success" });
      onChange(nextValue);
    },
    [onChange],
  );

  const handleUploadError = useCallback(
    (uploadError: ImageInputError) => {
      if (uploadControllerRef.current?.signal.aborted) {
        uploadControllerRef.current = null;
        activeUploadRequestRef.current = null;
        dispatch({ type: "cancel" });
        return;
      }
      reportError(uploadError);
    },
    [reportError],
  );

  const uploadValidatedFile = (file: File, requestId: number) => {
    if (validationRequestRef.current !== requestId || !onUpload) return;
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    activeUploadRequestRef.current = requestId;
    dispatch({ type: "validation-complete", file });
    try {
      onUpload({
        file,
        signal: controller.signal,
        onProgress: (nextProgress) => {
          if (activeUploadRequestRef.current === requestId) handleUploadProgress(nextProgress);
        },
        onSuccess: (nextValue) => {
          if (activeUploadRequestRef.current === requestId) handleUploadSuccess(nextValue);
        },
        onError: (uploadError) => {
          if (activeUploadRequestRef.current === requestId) handleUploadError(uploadError);
        },
      });
    } catch (uploadError) {
      if (controller.signal.aborted) {
        dispatch({ type: "cancel" });
      } else {
        reportError(
          errorFromUnknown(
            uploadError,
            "NETWORK_FAILURE",
            "The image upload could not be started.",
          ),
        );
      }
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

  const handleCancelUpload = () => {
    validationRequestRef.current += 1;
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = null;
    activeUploadRequestRef.current = null;
    dispatch({ type: "cancel" });
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

  const handleSelectVariable = (variable: VariableReference<ImageValue>) => {
    dispatch({ type: "close-variables" });
    onChange(variable);
  };

  const handleDisconnectVariable = () => {
    dispatch({ type: "close-variables" });
    onChange(resolvedValue);
  };

  const openVariablePicker = () => dispatch({ type: "open-variables" });
  const closeVariablePicker = () => dispatch({ type: "close-variables" });
  const updateVariableQuery = (query: string) => dispatch({ type: "variable-query", query });

  return {
    inputRef,
    reportError,
    imageState,
    isBusy,
    resolvedValue,
    linkedVariable,
    filteredVariables,
    handleCropComplete,
    handleCropCancel,
    handleCancelUpload,
    handleFileInputChange,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleEdit,
    handleSelectVariable,
    handleDisconnectVariable,
    openVariablePicker,
    closeVariablePicker,
    updateVariableQuery,
  };
};

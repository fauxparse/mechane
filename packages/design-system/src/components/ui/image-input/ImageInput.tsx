import { type ImageValue, type ResolvedImageValue, type VariableReference } from "@mechane/domain";
import { useCallback } from "react";

import { useToastManager } from "../toast";
import { Popover, PopoverContent } from "../popover";
import { VariablePicker } from "../property-input/variable-picker";
import { ImageCropper } from "./ImageCropper";
import { ImageInputVariableControl } from "./ImageInputVariableControl";
import { ImageInputView } from "./ImageInputView";
import type { ImageInputCrop } from "./crop-types";
import { useImageInputController } from "./use-image-input-controller";
import type {
  ImageInputError,
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
  variables?: VariableReference<ImageValue>[];
  imageAssets?: readonly ResolvedImageValue[];
  readOnly?: boolean;
  allowLink?: boolean;
  validation?: ImageInputValidation;
  crop?: ImageInputCrop;
  onChange: (value: ImageInputValue | null) => void;
  onDelete?: () => void;
  onError?: (error: ImageInputError) => void;
  onUpload?: (props: ImageInputOnUploadProps) => void;
};

export const ImageInput = ({
  className,
  value,
  variables = [],
  imageAssets = [],
  readOnly = false,
  allowLink = true,
  validation,
  crop,
  onChange,
  onDelete,
  onError,
  onUpload,
}: ImageInputProps) => {
  const toastManager = useToastManager();
  const handleImageError = useCallback(
    (error: ImageInputError) => {
      toastManager.add({
        title: "Image upload failed",
        description: error.message,
        type: "error",
      });
      onError?.(error);
    },
    [onError, toastManager],
  );
  const controller = useImageInputController({
    value,
    variables,
    imageAssets,
    readOnly,
    validation,
    crop,
    onChange,
    onError: handleImageError,
    onUpload,
  });

  return (
    <>
      <Popover
        open={controller.imageState.variablesOpen}
        onOpenChange={(open) => {
          if (open) controller.openVariablePicker();
          else controller.closeVariablePicker();
        }}
      >
        <ImageInputView
          className={className}
          value={value}
          resolvedValue={controller.resolvedValue}
          phase={controller.imageState.phase}
          busy={controller.isBusy}
          isValidating={controller.imageState.isValidating}
          progress={controller.imageState.progress}
          previewUrl={controller.imageState.previewUrl}
          isDragging={controller.imageState.isDragging}
          pickerOpen={controller.imageState.variablesOpen}
          readOnly={readOnly}
          canUpload={Boolean(onUpload)}
          inputRef={controller.inputRef}
          onFileInputChange={controller.handleFileInputChange}
          onDragEnter={controller.handleDragEnter}
          onDragOver={controller.handleDragOver}
          onDragLeave={controller.handleDragLeave}
          onDrop={controller.handleDrop}
          onBrowse={() => controller.inputRef.current?.click()}
          onCancelUpload={controller.handleCancelUpload}
          variableControl={
            allowLink && variables.length > 0 && !readOnly ? (
              <ImageInputVariableControl linkedVariable={controller.linkedVariable} />
            ) : (
              <span />
            )
          }
          onEdit={crop && controller.resolvedValue && onUpload ? controller.handleEdit : undefined}
          onDelete={onDelete}
        />
        <PopoverContent align="end" className="gap-0 overflow-hidden p-0">
          <VariablePicker
            query={controller.imageState.variableQuery}
            variables={controller.filteredVariables}
            totalVariables={variables.length}
            linkedVariable={controller.linkedVariable}
            onQueryChange={controller.updateVariableQuery}
            onClose={controller.closeVariablePicker}
            onSelect={controller.handleSelectVariable}
            onDisconnect={controller.handleDisconnectVariable}
          />
        </PopoverContent>
      </Popover>
      <ImageCropper
        key={controller.imageState.cropSession}
        open={controller.imageState.cropOpen}
        source={controller.imageState.cropSource}
        aspectRatio={crop?.aspectRatio}
        outputWidth={crop?.outputWidth}
        outputHeight={crop?.outputHeight}
        fileName={
          controller.imageState.cropSource instanceof File
            ? controller.imageState.cropSource.name
            : undefined
        }
        fileType={
          controller.imageState.cropSource instanceof File
            ? controller.imageState.cropSource.type
            : undefined
        }
        onCancel={controller.handleCropCancel}
        onComplete={controller.handleCropComplete}
        onError={controller.reportError}
      />
    </>
  );
};

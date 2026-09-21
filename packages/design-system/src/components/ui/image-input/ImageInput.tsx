import { type ImageValue, type ResolvedImageValue, type VariableReference } from "@mechane/domain";
import { useCallback } from "react";

import { useVibe, Vibe } from "../../inspector-vibe";
import { Popover, PopoverContent } from "../popover";
import { VariablePicker } from "../property-input/variable-picker";
import { useToastManager } from "../toast";
import { CompactImageInputView } from "./CompactImageInputView";
import { ImageCropper } from "./ImageCropper";
import { ImageInputVariableControl } from "./ImageInputVariableControl";
import { ImageInputView } from "./ImageInputView";
import type { ImageInputCrop } from "./crop-types";
import type {
  ImageInputError,
  ImageInputOnUploadProps,
  ImageInputValidation,
  ImageInputValue,
} from "./types";
import { useImageInputController } from "./use-image-input-controller";

export type { ImageInputCrop } from "./crop-types";
export type {
  ImageInputError,
  ImageInputErrorCode,
  ImageInputOnUploadProps,
  ImageInputValidation,
  ImageInputValue,
} from "./types";

export type ImageInputProps = {
  className?: string;
  value: ImageInputValue | null;
  variables?: VariableReference<ImageValue>[];
  imageAssets?: readonly ResolvedImageValue[];
  compact?: boolean;
  readOnly?: boolean;
  allowLink?: boolean;
  validation?: ImageInputValidation;
  crop?: ImageInputCrop;
  vibe?: Vibe;
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
  compact = false,
  readOnly = false,
  allowLink = true,
  validation,
  crop,
  vibe: vibeOverride,
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
  const vibe = useVibe(vibeOverride);

  if (compact) {
    return (
      <CompactImageInputView
        value={value}
        resolvedValue={controller.resolvedValue}
        previewUrl={controller.imageState.previewUrl}
        phase={controller.imageState.phase}
        progress={controller.imageState.progress}
        readOnly={readOnly}
        canUpload={Boolean(onUpload)}
        inputRef={controller.inputRef}
        vibe={vibe}
        onFileInputChange={controller.handleFileInputChange}
        onBrowse={() => controller.inputRef.current?.click()}
        onCancelUpload={controller.handleCancelUpload}
        onDelete={onDelete}
      />
    );
  }

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
          compact={compact}
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

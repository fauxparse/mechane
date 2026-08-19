import { type ImageValue, type ResolvedImageValue, type VariableReference } from "@mechane/domain";
import { Link2Icon, Unlink2Icon } from "lucide-react";

import { Button } from "../button";
import { Popover, PopoverContent } from "../popover";
import { VariablePicker } from "../property-input/variable-picker";
import { ImageCropper } from "./ImageCropper";
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
  validation,
  crop,
  onChange,
  onDelete,
  onError,
  onUpload,
}: ImageInputProps) => {
  const controller = useImageInputController({
    value,
    variables,
    imageAssets,
    readOnly,
    validation,
    crop,
    onChange,
    onError,
    onUpload,
  });
  const variableControl =
    variables.length > 0 && !readOnly ? (
      <Button
        type="button"
        variant={controller.linkedVariable ? "secondary" : "ghost"}
        size="icon"
        aria-label={controller.linkedVariable ? "Disconnect variable" : "Connect variable"}
        onClick={controller.openVariablePicker}
      >
        {controller.linkedVariable ? (
          <Unlink2Icon className="size-4" aria-hidden="true" />
        ) : (
          <Link2Icon className="size-4" aria-hidden="true" />
        )}
      </Button>
    ) : undefined;

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
          error={controller.imageState.error}
          isDragging={controller.imageState.isDragging}
          readOnly={readOnly}
          canUpload={Boolean(onUpload)}
          onFileInputChange={controller.handleFileInputChange}
          onDragEnter={controller.handleDragEnter}
          onDragOver={controller.handleDragOver}
          onDragLeave={controller.handleDragLeave}
          onDrop={controller.handleDrop}
          onBrowse={() => controller.inputRef.current?.click()}
          onCancelUpload={controller.handleCancelUpload}
          variableControl={variableControl}
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

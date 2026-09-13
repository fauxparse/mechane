import type { ChangeEvent, ReactNode, RefObject } from "react";
import { ImageInputButtons, ImageInputOverlay } from "./ImageInputActions";

import type { ImageInputValue } from "./types";
import { ImageUploadIcon } from "./ImageUploadIcon";
import { ACCEPTED_IMAGE_ACCEPT } from "./utils";

export type ImageInputControlsProps = {
  value: ImageInputValue | null;
  phase: "idle" | "loading";
  busy: boolean;
  isValidating: boolean;
  progress: number;
  readOnly: boolean;
  canUpload: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBrowse: () => void;
  onCancelUpload: () => void;
  variableControl?: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
};

export function ImageInputControls({
  value,
  phase,
  busy,
  isValidating,
  progress,
  readOnly,
  canUpload,
  inputRef,
  onFileInputChange,
  onBrowse,
  onCancelUpload,
  variableControl,
  onEdit,
  onDelete,
}: ImageInputControlsProps) {
  return (
    <>
      <ImageUploadIcon state={phase} progress={progress} />
      <input
        className="sr-only"
        type="file"
        aria-label="Choose image file"
        accept={ACCEPTED_IMAGE_ACCEPT}
        ref={inputRef}
        onChange={onFileInputChange}
        disabled={readOnly || busy || !canUpload}
      />
      <ImageInputButtons
        phase={phase}
        busy={busy}
        isValidating={isValidating}
        readOnly={readOnly}
        canUpload={canUpload}
        onBrowse={onBrowse}
        onCancelUpload={onCancelUpload}
        onEdit={onEdit}
      />
      <ImageInputOverlay
        value={value}
        busy={busy}
        readOnly={readOnly}
        variableControl={variableControl}
        onDelete={onDelete}
      />
    </>
  );
}

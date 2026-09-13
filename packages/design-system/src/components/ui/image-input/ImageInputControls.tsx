import type { ChangeEvent, ReactNode, RefObject } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";

import { Button } from "../button";
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="group-data-[empty=false]/input:border-foreground group-data-[empty=false]/input:hover:border-foreground disabled:border-transparent"
        onClick={onBrowse}
        disabled={readOnly || busy || !canUpload}
      >
        {isValidating ? "Checking..." : busy ? "Uploading..." : "Browse files"}
      </Button>
      {phase === "loading" && (
        <Button type="button" variant="ghost" onClick={onCancelUpload}>
          Cancel
        </Button>
      )}
      {onEdit && !busy && !readOnly && (
        <Button type="button" variant="secondary" onClick={onEdit}>
          <PencilIcon className="size-4" />
          Edit
        </Button>
      )}
      <div className="absolute top-2 left-2 right-2 z-2 flex justify-between items-center gap-2 pointer-events-none">
        {!busy && variableControl}
        {!busy && onDelete && value && !readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full bg-neutral-900/50 hover:bg-neutral-900/75 dark:bg-neutral-900/50 dark:hover:bg-neutral-900/75 fg-neutral-100 pointer-events-auto"
            onClick={onDelete}
            aria-label="Remove image"
          >
            <Trash2Icon className="size-4" />
          </Button>
        )}
      </div>
    </>
  );
}

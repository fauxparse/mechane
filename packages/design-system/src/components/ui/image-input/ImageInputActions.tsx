import { PencilIcon, Trash2Icon } from "lucide-react";

import { Button } from "../button";
import type { ImageInputControlsProps } from "./ImageInputControls";

type ImageInputButtonsProps = Pick<
  ImageInputControlsProps,
  | "phase"
  | "busy"
  | "isValidating"
  | "readOnly"
  | "canUpload"
  | "onBrowse"
  | "onCancelUpload"
  | "onEdit"
>;

export function ImageInputButtons({
  phase,
  busy,
  isValidating,
  readOnly,
  canUpload,
  onBrowse,
  onCancelUpload,
  onEdit,
}: ImageInputButtonsProps) {
  return (
    <>
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
    </>
  );
}

type ImageInputOverlayProps = Pick<
  ImageInputControlsProps,
  "value" | "busy" | "readOnly" | "variableControl" | "onDelete"
>;

export function ImageInputOverlay({
  value,
  busy,
  readOnly,
  variableControl,
  onDelete,
}: ImageInputOverlayProps) {
  return (
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
  );
}

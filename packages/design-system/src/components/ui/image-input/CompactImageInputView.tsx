import { ImageIcon, Trash2Icon, XIcon } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";

import { Button } from "../button";
import type { ResolvedImageValue } from "@mechane/domain";
import type { ImageInputValue } from "./types";
import { ACCEPTED_IMAGE_ACCEPT } from "./utils";
export function CompactImageInputView({
  value,
  resolvedValue,
  previewUrl,
  phase,
  progress,
  readOnly,
  canUpload,
  inputRef,
  onFileInputChange,
  onBrowse,
  onCancelUpload,
  onDelete,
}: {
  value: ImageInputValue | null;
  resolvedValue: ResolvedImageValue | null;
  previewUrl: string | null;
  phase: "idle" | "loading";
  progress: number;
  readOnly: boolean;
  canUpload: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onFileInputChange(event: ChangeEvent<HTMLInputElement>): void;
  onBrowse(): void;
  onCancelUpload(): void;
  onDelete?: () => void;
}) {
  const imageUrl = previewUrl ?? resolvedValue?.url;
  const imageName = resolvedValue?.name ?? resolvedValue?.alt ?? "(Empty)";
  const uploading = phase === "loading";

  return (
    <div
      className="flex h-8 min-h-8 w-full min-w-0 items-center overflow-hidden rounded-sm border border-input bg-muted/30 text-xs"
      data-empty={!imageUrl || undefined}
      data-state={phase}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={resolvedValue?.alt ?? "Image preview"}
          className="size-8 shrink-0 object-cover"
        />
      ) : (
        <ImageIcon className="mx-1.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate px-1.5 text-[0.7rem]" title={imageName}>
        {uploading ? `${Math.round(progress)}%` : imageName}
      </span>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept={ACCEPTED_IMAGE_ACCEPT}
        aria-label="Choose image file"
        onChange={onFileInputChange}
        disabled={readOnly || uploading || !canUpload}
      />
      {uploading ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Cancel image upload"
          onClick={onCancelUpload}
        >
          <XIcon />
        </Button>
      ) : canUpload && !readOnly ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={value ? "Replace image" : "Upload image"}
          onClick={onBrowse}
        >
          <ImageIcon />
        </Button>
      ) : null}
      {value && onDelete && !readOnly && !uploading ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Remove image"
          onClick={onDelete}
        >
          <Trash2Icon />
        </Button>
      ) : null}
    </div>
  );
}

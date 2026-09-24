import { cva, VariantProps } from "class-variance-authority";
import { ImageOffIcon, ImagePlusIcon, Trash2Icon, XIcon } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";

import type { ResolvedImageValue } from "@mechane/domain/shapes";
import { useVibe } from "../../inspector-vibe";
import { Button } from "../button";
import type { ImageInputValue } from "./types";
import { ACCEPTED_IMAGE_ACCEPT } from "./utils";

const variants = cva("flex h-8 min-h-8 w-full min-w-0 items-center overflow-hidden text-xs", {
  variants: {
    vibe: {
      default: "border border-border rounded-sm",
      inspector: "rounded-sm bg-muted/30",
      table: "border-0",
    },
  },
});

type CompactImageInputViewProps = {
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
} & VariantProps<typeof variants>;

export function CompactImageInputView({
  value,
  resolvedValue,
  previewUrl,
  phase,
  progress,
  readOnly,
  canUpload,
  inputRef,
  vibe: vibeOverride,
  onFileInputChange,
  onBrowse,
  onCancelUpload,
  onDelete,
}: CompactImageInputViewProps) {
  const imageUrl = previewUrl ?? resolvedValue?.url;
  const imageName = resolvedValue?.name ?? resolvedValue?.alt ?? "(Empty)";
  const uploading = phase === "loading";
  const vibe = useVibe(vibeOverride ?? "default");

  return (
    <div className={variants({ vibe })} data-empty={!imageUrl || undefined} data-state={phase}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={resolvedValue?.alt ?? "Image preview"}
          className="size-8 shrink-0 object-cover"
        />
      ) : (
        <ImageOffIcon className="mx-1.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate px-1.5 text-[0.7rem]" title={imageName}>
        {uploading ? (
          `${Math.round(progress)}%`
        ) : resolvedValue ? (
          imageName
        ) : (
          <span className="text-muted-foreground">(Empty)</span>
        )}
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
          size="icon-sm"
          aria-label="Cancel image upload"
          onClick={onCancelUpload}
        >
          <XIcon className="size-6" />
        </Button>
      ) : canUpload && !readOnly ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={value ? "Replace image" : "Upload image"}
          onClick={onBrowse}
        >
          <ImagePlusIcon className="size-5" />
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

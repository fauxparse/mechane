import type { ResolvedImageValue } from "@mechane/domain";
import type { ChangeEvent, CSSProperties, DragEvent, ReactNode } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";

import { Alert, AlertDescription } from "../alert";
import { Button } from "../button";
import { cn } from "../../../lib/utils";
import { ImageUploadIcon } from "./ImageUploadIcon";
import { ACCEPTED_IMAGE_ACCEPT } from "./utils";
import type { ImageInputError, ImageInputValue } from "./types";

type ImageInputViewProps = {
  className?: string;
  value: ImageInputValue | null;
  resolvedValue: ResolvedImageValue | null;
  phase: "idle" | "loading";
  busy: boolean;
  isValidating: boolean;
  progress: number;
  previewUrl: string | null;
  error: ImageInputError | null;
  isDragging: boolean;
  readOnly: boolean;
  canUpload: boolean;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onBrowse: () => void;
  onCancelUpload: () => void;
  variableControl?: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
};

export const ImageInputView = ({
  className,
  value,
  resolvedValue,
  phase,
  busy,
  isValidating,
  progress,
  previewUrl,
  error,
  isDragging,
  readOnly,
  canUpload,
  onFileInputChange,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
  onCancelUpload,
  variableControl,
  onEdit,
  onDelete,
}: ImageInputViewProps) => {
  const isBusy = busy;
  return (
    <div
      className={cn(
        "group/input relative w-full aspect-video rounded-md grid overflow-hidden *:col-start-1 *:row-start-1",
        className,
      )}
      data-empty={!resolvedValue && !previewUrl}
      data-state={phase}
      data-dragging={isDragging || undefined}
      aria-readonly={readOnly || undefined}
    >
      <img
        src={previewUrl ?? resolvedValue?.url}
        alt={resolvedValue?.alt ?? "Image preview"}
        className="group-data-[empty=true]/input:hidden group-data-[state=loading]/input:block size-full min-h-0 min-w-0 object-cover rounded-[inherit] group-data-[state=loading]/input:opacity-100 group-data-[state=loading]/input:blur-(--progress-blur) transition-all"
        style={
          {
            "--progress-blur": `${Math.round((100 - progress) / 2)}px`,
          } as CSSProperties
        }
      />
      <div
        className={cn(
          "relative z-1 flex w-full h-full flex-col items-center justify-center gap-4 p-4 rounded-[inherit] bg-muted/50 border border-dashed border-transparent transition-opacity duration-500 hover:duration-300",
          isBusy
            ? "opacity-100"
            : "group-data-[empty=false]/input:opacity-0 group-data-[empty=false]/input:backdrop-blur-sm group-data-[empty=false]/input:backdrop-saturate-25 group-data-[empty=false]/input:backdrop-brightness-50 hover:opacity-100 group-data-[dragging=true]/input:border-foreground group-data-[dragging=true]/input:opacity-100",
        )}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <ImageUploadIcon state={phase} progress={progress} />
        <input
          className="sr-only"
          type="file"
          aria-label="Choose image file"
          accept={ACCEPTED_IMAGE_ACCEPT}
          onChange={onFileInputChange}
          disabled={readOnly || isBusy || !canUpload}
        />
        <Button
          type="button"
          variant="outline"
          className="group-data-[empty=false]/input:border-foreground group-data-[empty=false]/input:hover:border-foreground disabled:border-transparent"
          onClick={onBrowse}
          disabled={readOnly || isBusy || !canUpload}
        >
          {isValidating ? "Checking..." : isBusy ? "Uploading..." : "Browse files"}
        </Button>
        {phase === "loading" && (
          <Button type="button" variant="ghost" onClick={onCancelUpload}>
            Cancel
          </Button>
        )}
        {onEdit && !isBusy && !readOnly && (
          <Button type="button" variant="secondary" onClick={onEdit}>
            <PencilIcon className="size-4" />
            Edit
          </Button>
        )}
      </div>
      <div className="absolute top-2 right-2 z-2 flex items-center gap-1">
        {!isBusy && variableControl}
        {!isBusy && onDelete && value && !readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full bg-neutral-900/50 hover:bg-neutral-900/75 dark:bg-neutral-900/50 dark:hover:bg-neutral-900/75 fg-neutral-100"
            onClick={onDelete}
          >
            <Trash2Icon className="size-4" />
          </Button>
        )}
      </div>
      {error && (
        <Alert
          variant="destructive"
          className="absolute inset-x-2 bottom-2 z-3 w-auto py-2 text-xs"
        >
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

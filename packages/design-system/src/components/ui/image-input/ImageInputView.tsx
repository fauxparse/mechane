import type { ResolvedImageValue } from "@mechane/domain/shapes";
import type { ChangeEvent, CSSProperties, DragEvent, ReactNode, RefObject } from "react";

import { cn } from "../../../lib/utils";
import { ImageInputDropzone } from "./ImageInputDropzone";
import type { ImageInputValue } from "./types";

type ImageInputViewProps = {
  className?: string;
  compact?: boolean;
  value: ImageInputValue | null;
  resolvedValue: ResolvedImageValue | null;
  phase: "idle" | "loading";
  busy: boolean;
  isValidating: boolean;
  progress: number;
  previewUrl: string | null;
  isDragging: boolean;
  pickerOpen?: boolean;
  readOnly: boolean;
  canUpload: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
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
  compact = false,
  value,
  resolvedValue,
  phase,
  busy,
  isValidating,
  progress,
  previewUrl,
  isDragging,
  pickerOpen = false,
  readOnly,
  canUpload,
  inputRef,
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
  return (
    <div
      className={cn(
        compact
          ? "group/input relative inline-grid h-8! max-h-8! min-h-8! w-full! min-w-24 max-w-44 overflow-hidden rounded-sm *:col-start-1 *:row-start-1 [&>img]:h-full! [&>img]:w-8! [&>img]:object-cover [&_button]:h-6 [&_button]:min-w-0 [&_button]:px-1 [&_button]:text-[10px]"
          : "group/input relative w-full aspect-video rounded-md grid overflow-hidden *:col-start-1 *:row-start-1",
        className,
      )}
      data-empty={!resolvedValue && !previewUrl}
      data-state={phase}
      data-dragging={isDragging || undefined}
      data-picker-open={pickerOpen || undefined}
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
      {resolvedValue?.name ? (
        <span className="z-2 self-end justify-self-stretch truncate bg-black/60 px-2 py-1 text-xs text-white">
          {resolvedValue.name}
        </span>
      ) : null}
      <ImageInputDropzone
        value={value}
        phase={phase}
        busy={busy}
        isValidating={isValidating}
        progress={progress}
        readOnly={readOnly}
        canUpload={canUpload}
        inputRef={inputRef}
        onFileInputChange={onFileInputChange}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onBrowse={onBrowse}
        onCancelUpload={onCancelUpload}
        variableControl={variableControl}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  );
};

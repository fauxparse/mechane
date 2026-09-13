import type { ResolvedImageValue } from "@mechane/domain";
import type { ChangeEvent, CSSProperties, DragEvent, ReactNode, RefObject } from "react";

import { cn } from "../../../lib/utils";
import { ImageInputDropzone } from "./ImageInputDropzone";
import type { ImageInputValue } from "./types";

type ImageInputViewProps = {
  className?: string;
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
        "group/input relative w-full aspect-video rounded-md grid overflow-hidden *:col-start-1 *:row-start-1",
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

import type { DragEvent } from "react";

import { cn } from "../../../lib/utils";
import { ImageInputControls, type ImageInputControlsProps } from "./ImageInputControls";

type ImageInputDropzoneProps = ImageInputControlsProps & {
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};

export function ImageInputDropzone({
  busy,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  ...controls
}: ImageInputDropzoneProps) {
  return (
    <div
      className={cn(
        "relative z-1 flex w-full h-full flex-col items-center justify-center gap-2 p-2 rounded-[inherit] bg-muted/50 border border-dashed border-transparent transition-opacity duration-500 hover:duration-300",
        busy
          ? "opacity-100"
          : "group-data-[empty=false]/input:opacity-0 group-data-[empty=false]/input:backdrop-blur-sm group-data-[empty=false]/input:backdrop-saturate-25 group-data-[empty=false]/input:backdrop-brightness-50 hover:opacity-100 group-data-[picker-open=true]/input:opacity-100 group-data-[dragging=true]/input:border-foreground group-data-[dragging=true]/input:opacity-100",
      )}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <ImageInputControls busy={busy} {...controls} />
    </div>
  );
}

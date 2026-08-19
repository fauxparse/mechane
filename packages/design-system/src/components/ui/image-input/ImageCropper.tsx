import { MinusIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "../dialog";
import { Slider } from "../slider";
import { cn } from "../../../lib/utils";
import type { ImageInputCrop } from "./crop-types";
import type { ImageInputError } from "./types";

export type ImageCropperProps = ImageInputCrop & {
  open: boolean;
  source: File | string | null;
  fileName?: string;
  fileType?: string;
  onCancel: () => void;
  onComplete: (file: File) => void;
  onError: (error: ImageInputError) => void;
};

type ImageSize = { width: number; height: number };
type Pan = { x: number; y: number };
type DragStart = { clientX: number; clientY: number; pan: Pan };

type CropRect = { x: number; y: number; width: number; height: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const cropRectFor = (
  imageSize: ImageSize,
  aspectRatio: number,
  zoom: number,
  pan: Pan,
): CropRect => {
  const imageAspectRatio = imageSize.width / imageSize.height;
  const baseWidth =
    imageAspectRatio >= aspectRatio ? imageSize.height * aspectRatio : imageSize.width;
  const baseHeight =
    imageAspectRatio >= aspectRatio ? imageSize.height : imageSize.width / aspectRatio;
  const width = baseWidth / zoom;
  const height = baseHeight / zoom;
  const maxX = (imageSize.width - width) / 2;
  const maxY = (imageSize.height - height) / 2;

  return {
    x: (imageSize.width - width) / 2 + pan.x * maxX,
    y: (imageSize.height - height) / 2 + pan.y * maxY,
    width,
    height,
  };
};

const outputSizeFor = (
  crop: CropRect,
  aspectRatio: number,
  outputWidth?: number,
  outputHeight?: number,
): ImageSize => {
  if (outputWidth !== undefined && outputHeight !== undefined) {
    return { width: outputWidth, height: outputHeight };
  }
  if (outputWidth !== undefined) {
    return { width: outputWidth, height: Math.round(outputWidth / aspectRatio) };
  }
  if (outputHeight !== undefined) {
    return { width: Math.round(outputHeight * aspectRatio), height: outputHeight };
  }
  return { width: Math.round(crop.width), height: Math.round(crop.height) };
};

const sourceDetails = (source: File | string) =>
  typeof source === "string"
    ? { url: source, fileName: "cropped-image.png", fileType: "image/png" }
    : { url: null, fileName: source.name, fileType: source.type || "image/png" };

export const ImageCropper = ({
  open,
  source,
  aspectRatio,
  outputWidth,
  outputHeight,
  fileName,
  fileType,
  onCancel,
  onComplete,
  onError,
}: ImageCropperProps) => {
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragStart | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });

  useEffect(() => {
    if (!source) {
      setSourceUrl(null);
      setImageSize(null);
      return;
    }
    if (typeof source === "string") {
      setSourceUrl(source);
      setImageSize(null);
      return;
    }

    const url = URL.createObjectURL(source);
    setSourceUrl(url);
    setImageSize(null);
    return () => URL.revokeObjectURL(url);
  }, [source]);

  const handleImageLoad = () => {
    const image = imageRef.current;
    if (!image || image.naturalWidth === 0 || image.naturalHeight === 0) return;
    setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!stageRef.current) return;
    stageRef.current.setPointerCapture(event.pointerId);
    dragRef.current = { clientX: event.clientX, clientY: event.clientY, pan };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !stageRef.current) return;
    const bounds = stageRef.current.getBoundingClientRect();
    const deltaX = ((event.clientX - dragRef.current.clientX) / bounds.width) * 2;
    const deltaY = ((event.clientY - dragRef.current.clientY) / bounds.height) * 2;
    setPan({
      x: clamp(dragRef.current.pan.x + deltaX, -1, 1),
      y: clamp(dragRef.current.pan.y + deltaY, -1, 1),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (stageRef.current?.hasPointerCapture(event.pointerId)) {
      stageRef.current.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const handleComplete = () => {
    const image = imageRef.current;
    if (!source || !imageSize || !image || !sourceUrl) {
      onError({ code: "INVALID_IMAGE", message: "The image is not ready to be cropped." });
      return;
    }

    const resolvedAspectRatio = aspectRatio ?? imageSize.width / imageSize.height;
    const crop = cropRectFor(imageSize, resolvedAspectRatio, zoom, pan);
    const output = outputSizeFor(crop, resolvedAspectRatio, outputWidth, outputHeight);
    const canvas = document.createElement("canvas");
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext("2d");
    if (!context) {
      onError({ code: "TRANSFORM_FAILED", message: "The image could not be cropped." });
      return;
    }

    try {
      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        output.width,
        output.height,
      );
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            onError({
              code: "TRANSFORM_FAILED",
              message: "The cropped image could not be created.",
            });
            return;
          }
          const details = sourceDetails(source);
          onComplete(
            new File([blob], fileName ?? details.fileName, {
              type: fileType ?? details.fileType,
            }),
          );
        },
        fileType ?? sourceDetails(source).fileType,
      );
    } catch (cause) {
      onError({ code: "TRANSFORM_FAILED", message: "The image could not be cropped.", cause });
    }
  };

  const resolvedAspectRatio =
    aspectRatio ?? (imageSize ? imageSize.width / imageSize.height : 16 / 9);
  const imageTransform = `translate(${pan.x * 25}%, ${pan.y * 25}%) scale(${zoom})`;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className="w-[min(42rem,calc(100vw-2rem))]">
        <div>
          <DialogTitle>Crop image</DialogTitle>
          <DialogDescription>Drag to reposition the image, then adjust the zoom.</DialogDescription>
        </div>
        <div
          ref={stageRef}
          className={cn(
            "relative w-full touch-none overflow-hidden rounded-lg bg-muted ring-1 ring-border",
            !imageSize && "animate-pulse",
          )}
          style={{ aspectRatio: resolvedAspectRatio }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {sourceUrl && (
            <img
              ref={imageRef}
              src={sourceUrl}
              alt="Crop preview"
              className="absolute inset-0 size-full select-none object-cover"
              style={{ transform: imageTransform }}
              crossOrigin={typeof source === "string" ? "anonymous" : undefined}
              draggable={false}
              onLoad={handleImageLoad}
            />
          )}
          <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-white/90" />
        </div>
        <div className="flex items-center gap-3">
          <MinusIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          <Slider.Root
            value={zoom}
            min={1}
            max={3}
            step={0.01}
            className="flex-1"
            onValueChange={(nextValue) => setZoom(nextValue as number)}
          >
            <Slider.Control className="py-3">
              <Slider.Track className="h-2 bg-muted">
                <Slider.Indicator />
                <Slider.Thumb aria-label="Zoom" />
              </Slider.Track>
            </Slider.Control>
          </Slider.Root>
          <PlusIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleComplete} disabled={!imageSize}>
            Use image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

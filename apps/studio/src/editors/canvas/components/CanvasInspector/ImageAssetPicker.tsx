import { useRef, useState, type DragEvent } from "react";

import type { ImageAsset } from "@mechane/graphql-schema";
import {
  Button,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  XIcon,
} from "@mechane/design-system";

const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/svg+xml",
] as const;

const ACCEPTED_IMAGE_ACCEPT = ACCEPTED_IMAGE_TYPES.join(",");
const ACCEPTED_IMAGE_TYPE_SET = new Set<string>(ACCEPTED_IMAGE_TYPES);
const ACCEPTED_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".heic",
  ".heif",
  ".svg",
]);

const isAcceptedImageFile = (file: File): boolean => {
  if (ACCEPTED_IMAGE_TYPE_SET.has(file.type)) return true;
  const extensionStart = file.name.lastIndexOf(".");
  if (extensionStart === -1) return false;
  return ACCEPTED_IMAGE_EXTENSIONS.has(file.name.slice(extensionStart).toLowerCase());
};

const firstAcceptedImage = (files: FileList | null | undefined): File | undefined => {
  if (!files) return undefined;
  return Array.from(files).find(isAcceptedImageFile);
};

const isFileDrag = (event: DragEvent): boolean =>
  Array.from(event.dataTransfer.types).includes("Files");

export interface ImageAssetPickerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  assets: readonly ImageAsset[];
  onSelect(asset: ImageAsset): void;
  onUpload?(file: File): void;
}

/** Focused image source picker; storage and upload state stay behind callbacks. */
export const ImageAssetPicker = ({
  open,
  onOpenChange,
  assets,
  onSelect,
  onUpload,
}: ImageAssetPickerProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = assets.find((asset) => asset.id === selectedId) ?? null;

  const resetDragState = () => {
    dragDepthRef.current = 0;
    setIsDragging(false);
  };

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = onUpload ? "copy" : "none";
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) resetDragState();
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resetDragState();
    const file = firstAcceptedImage(event.dataTransfer.files);
    if (file) onUpload?.(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-label="Choose image" className="w-[min(42rem,calc(100vw-2rem))] p-2">
        <Tabs defaultValue="upload" className="min-h-64">
          <div className="grid items-center grid-cols-[auto_1fr_auto] @md:grid-cols-[1fr_auto_1fr] gap-2">
            <DialogTitle className="px-2">Choose image</DialogTitle>
            <DialogDescription className="sr-only">
              Upload a new image or reuse one from this Show's gallery.
            </DialogDescription>
            <TabsList className="rounded-full bg-muted *:rounded-full *:border-0 *:px-4">
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="gallery">Gallery</TabsTrigger>
            </TabsList>
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close"
                  className="opacity-50 hover:opacity-100 hover:bg-transparent dark:hover:bg-transparent justify-self-end"
                >
                  <XIcon />
                </Button>
              }
            />
          </div>
          <TabsContent
            value="upload"
            className={cn(
              "flex min-h-52 items-center justify-center rounded-lg border border-dashed p-6",
              isDragging && "border-primary bg-primary/5",
            )}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <span>{isDragging ? "Drop to upload" : "Drop an image here, or browse"}</span>
              <input
                ref={inputRef}
                className="sr-only"
                type="file"
                aria-label="Choose image file"
                accept={ACCEPTED_IMAGE_ACCEPT}
                onChange={(event) => {
                  const file = firstAcceptedImage(event.currentTarget.files);
                  if (file) onUpload?.(file);
                  event.currentTarget.value = "";
                }}
              />
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                Browse files
              </Button>
            </div>
          </TabsContent>
          <TabsContent
            value="gallery"
            className="grid max-h-72 grid-cols-3 gap-3 overflow-y-auto p-1"
          >
            {assets.length === 0 ? (
              <p className="col-span-3 py-12 text-center text-sm text-muted-foreground">
                No images in this Show yet.
              </p>
            ) : (
              assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className={`overflow-hidden rounded-lg border text-left ${selectedId === asset.id ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
                  onClick={() => setSelectedId(asset.id)}
                >
                  <img
                    src={asset.url}
                    alt={asset.alt}
                    width={asset.width}
                    height={asset.height}
                    className="aspect-video w-full object-cover"
                  />
                  <span className="block truncate px-2 py-1 text-xs text-muted-foreground">
                    {asset.alt || "Decorative image"}
                  </span>
                </button>
              ))
            )}
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!selected} onClick={() => selected && onSelect(selected)}>
            Use image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

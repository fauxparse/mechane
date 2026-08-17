import { useState } from "react";

import type { ImageAsset } from "@mechane/graphql-schema";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@mechane/design-system";

export interface ImageAssetPickerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  assets: readonly ImageAsset[];
  onSelect(asset: ImageAsset): void;
  onUpload?(file: File): void;
}

/** Focused image source picker; storage and upload state stay behind callbacks. */
export function ImageAssetPicker({
  open,
  onOpenChange,
  assets,
  onSelect,
  onUpload,
}: ImageAssetPickerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = assets.find((asset) => asset.id === selectedId) ?? null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-label="Choose image" className="w-[min(42rem,calc(100vw-2rem))]">
        <DialogTitle>Choose image</DialogTitle>
        <DialogDescription>
          Upload a new image or reuse one from this Show's gallery.
        </DialogDescription>
        <Tabs defaultValue="gallery" className="min-h-64">
          <TabsList>
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="gallery">Gallery</TabsTrigger>
          </TabsList>
          <TabsContent
            value="upload"
            className="flex min-h-52 items-center justify-center rounded-lg border border-dashed p-6"
          >
            <label className="flex cursor-pointer flex-col items-center gap-2 text-sm text-muted-foreground">
              <span>Choose an image to upload</span>
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,image/svg+xml"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onUpload?.(file);
                }}
              />
              <Button type="button" variant="outline" tabIndex={-1}>
                Browse files
              </Button>
            </label>
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
}

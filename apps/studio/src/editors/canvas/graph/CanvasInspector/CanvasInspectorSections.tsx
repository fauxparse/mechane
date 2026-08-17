import { useState } from "react";
import type { ObjectFit, ObjectPosition } from "@mechane/domain";
import { isPropertyConnection } from "@mechane/domain";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  ToggleGroup,
  ToggleGroupItem,
} from "@mechane/design-system";

import { canvasDisplayName, canvasElementDisplayName } from "../../data/canvas-names";
import { elementIconFor } from "../utils";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { ImageAssetPicker } from "./ImageAssetPicker";
import { PropertyField } from "./CanvasInspectorFields";
export const InspectorHeader = () => {
  const { focused, elements } = useCanvasInspectorContext();
  const Icon = elementIconFor(elements.map((element) => element.type));
  const label =
    elements.length > 1
      ? `${elements.length} Elements`
      : elements[0]
        ? canvasElementDisplayName(elements[0])
        : focused
          ? canvasDisplayName(focused)
          : "Selection";

  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4" />
      <span className="truncate grow">{label}</span>
    </div>
  );
};

const OBJECT_FIT_OPTIONS: readonly { value: ObjectFit; label: string }[] = [
  { value: "cover", label: "Cover" },
  { value: "contain", label: "Contain" },
  { value: "fill", label: "Fill" },
  { value: "none", label: "None" },
  { value: "scale-down", label: "Scale down" },
];

const OBJECT_POSITION_OPTIONS: readonly {
  value: Exclude<ObjectPosition, "center">;
  label: string;
}[] = [
  { value: "left top", label: "Top left" },
  { value: "center top", label: "Top center" },
  { value: "right top", label: "Top right" },
  { value: "left center", label: "Center left" },
  { value: "center center", label: "Center" },
  { value: "right center", label: "Center right" },
  { value: "left bottom", label: "Bottom left" },
  { value: "center bottom", label: "Bottom center" },
  { value: "right bottom", label: "Bottom right" },
];

const positionValue = (value: unknown): Exclude<ObjectPosition, "center"> => {
  if (value === "center") return "center center";
  return OBJECT_POSITION_OPTIONS.find((option) => option.value === value)?.value ?? "center center";
};

export const ImageSection = () => {
  const { target, update, common, imageAssets, onImageUpload } = useCanvasInspectorContext();
  const [pickerOpen, setPickerOpen] = useState(false);
  if (target.type !== "image") return null;
  const hasImage = target.image !== undefined && target.image !== null;
  const objectFitValue =
    OBJECT_FIT_OPTIONS.find((option) => option.value === common("objectFit"))?.value ?? "cover";
  const objectPositionValue = positionValue(common("objectPosition"));
  const imageReference =
    target.image &&
    typeof target.image === "object" &&
    !isPropertyConnection(target.image) &&
    "assetId" in target.image &&
    "revision" in target.image &&
    typeof target.image.assetId === "string" &&
    typeof target.image.revision === "string"
      ? target.image
      : null;
  const intrinsicAsset = imageReference
    ? imageAssets.find(
        (asset) =>
          asset.id === imageReference.assetId && asset.revision === imageReference.revision,
      )
    : undefined;

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Image</SidebarGroupLabel>
        <SidebarGroupContent className="grid gap-2 p-3">
          <Button variant="outline" className="w-full" onClick={() => setPickerOpen(true)}>
            {hasImage ? "Change image" : "Choose image"}
          </Button>
          <PropertyField name="alt" />
          <Select
            value={objectFitValue}
            onValueChange={(value) => {
              if (value) update({ objectFit: value as ObjectFit });
            }}
          >
            <SelectTrigger
              aria-label="Object fit"
              className="w-full rounded-sm border-0 bg-muted/50 px-2"
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OBJECT_FIT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup
            aria-label="Object position"
            className="grid h-20 w-full grid-cols-3 grid-rows-3 gap-0 rounded-sm bg-muted/50 p-0"
            value={[objectPositionValue]}
            onValueChange={([value]) => {
              if (value) update({ objectPosition: value as ObjectPosition });
            }}
          >
            {OBJECT_POSITION_OPTIONS.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                aria-label={`Object position: ${option.label}`}
                title={option.label}
                className="group/image-position h-auto min-w-0 rounded-none border-0 bg-transparent p-0 hover:bg-transparent aria-pressed:bg-transparent"
              >
                <span className="size-1.5 rounded-full bg-foreground opacity-25 group-aria-pressed/image-position:opacity-100" />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            variant="outline"
            className="w-full"
            disabled={!intrinsicAsset}
            onClick={() => {
              if (!intrinsicAsset) return;
              update({
                sizing: {
                  ...target.sizing,
                  width: { mode: "fixed", value: intrinsicAsset.width },
                  height: { mode: "fixed", value: intrinsicAsset.height },
                },
              });
            }}
          >
            Reset to intrinsic size
          </Button>
        </SidebarGroupContent>
      </SidebarGroup>
      <ImageAssetPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        assets={imageAssets}
        onUpload={onImageUpload}
        onSelect={(asset) => {
          update({ image: { assetId: asset.id, revision: asset.revision } });
          setPickerOpen(false);
        }}
      />
    </>
  );
};

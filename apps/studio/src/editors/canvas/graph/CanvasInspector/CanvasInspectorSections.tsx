import { useState } from "react";
import {
  Button,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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

export const ImageSection = () => {
  const { target, update, imageAssets, onImageUpload } = useCanvasInspectorContext();
  const [pickerOpen, setPickerOpen] = useState(false);
  if (target.type !== "image") return null;
  const hasImage = target.image !== undefined && target.image !== null;

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Image</SidebarGroupLabel>
        <SidebarGroupContent className="p-3">
          <Button variant="outline" className="w-full" onClick={() => setPickerOpen(true)}>
            {hasImage ? "Change image" : "Choose image"}
          </Button>
          <PropertyField name="alt" />
          <PropertyField name="objectFit" />
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

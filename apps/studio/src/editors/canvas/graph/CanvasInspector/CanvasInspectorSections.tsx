import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@mechane/design-system";

import { canvasDisplayName, canvasElementDisplayName } from "../../data/canvas-names";
import { elementIconFor } from "../utils";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
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

export function TextSection() {
  const { target } = useCanvasInspectorContext();
  if (target.type !== "text") return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Text</SidebarGroupLabel>
      <SidebarGroupContent className="flex flex-col gap-3 p-3">
        <PropertyField name="content" />
        <PropertyField name="color" />
        <PropertyField name="fontFamily" />
        <PropertyField name="fontSize" />
        <PropertyField name="textAlign" />
        <PropertyField name="letterSpacing" />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export const ImageSection = () => {
  const { target } = useCanvasInspectorContext();
  if (target.type !== "image") return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Image</SidebarGroupLabel>
      <SidebarGroupContent className="p-3">
        <PropertyField name="src" />
        <PropertyField name="alt" />
        <PropertyField name="objectFit" />
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

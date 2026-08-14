import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@mechane/design-system";

import { canvasDisplayName, canvasElementDisplayName } from "../../data/canvas-names";
import { elementIconFor } from "../utils";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { PropertyField } from "./CanvasInspectorFields";

export function InspectorHeader() {
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
      {label}
    </div>
  );
}

export function FrameSection() {
  const { target, update } = useCanvasInspectorContext();
  if (target.type !== "frame") return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Frame layout</SidebarGroupLabel>
      <SidebarGroupContent className="flex flex-col gap-3 p-3">
        <label className="flex items-center justify-between gap-2 text-xs">
          Clip content
          <input
            type="checkbox"
            checked={target.clip === true}
            onChange={(event) => update({ clip: event.target.checked })}
          />
        </label>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

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

export function ImageSection() {
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
}

import type { FrameElement } from "@mechane/domain";
import { SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@mechane/design-system";

import type { CanvasArtboardDocument } from "../../api/canvas";
import { canvasElementParent, findCanvasElement } from "@mechane/commands";
import type { CanvasSelection } from "./canvas-selection";

type Props = {
  focused: CanvasArtboardDocument | null;
  selection: CanvasSelection;
  onUpdateElement?(
    canvasId: string,
    elementId: string,
    properties: Record<string, unknown>,
    unsetProperties?: readonly string[],
  ): void;
};

function fieldClass(): string {
  return "h-8 rounded-md border border-border bg-background px-2";
}

export function CanvasInspector({ focused, selection, onUpdateElement }: Props) {
  const elements = focused && selection.artId === focused.artId
    ? selection.elementIds.flatMap((id) => {
        const element = findCanvasElement(focused.canvas.root, id);
        return element ? [element] : [];
      })
    : [];
  const target = elements[0] ?? (focused && selection.artId === focused.artId ? focused.canvas.root : null);
  const common = (property: string): unknown => {
    if (elements.length === 0) return undefined;
    const first = (elements[0] as unknown as Record<string, unknown>)[property];
    return elements.every((element) => (element as unknown as Record<string, unknown>)[property] === first)
      ? first
      : undefined;
  };
  const update = (properties: Record<string, unknown>, unset: readonly string[] = []) => {
    if (!focused) return;
    for (const element of elements.length > 0 ? elements : target ? [target] : []) {
      onUpdateElement?.(focused.canvasId, element.id, properties, unset);
    }
  };
  const text = (property: string, fallback = "") => {
    const value = common(property);
    return value === undefined ? fallback : String(value ?? "");
  };
  const sizeField = (axis: "width" | "height") => {
    if (!target) return null;
    const size = target[axis];
    const mode = size?.mode ?? "hug";
    const value = typeof size?.value === "number" ? size.value : size?.value?.value;
    return (
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <label className="flex flex-col gap-1 text-xs">
          {axis}
          <select
            value={mode}
            onChange={(event) => update({ [axis]: { mode: event.target.value, ...(event.target.value === "fixed" ? { value: value ?? 100 } : {}) } })}
            className={fieldClass()}
          >
            <option value="hug">Hug</option><option value="fill">Fill</option><option value="fixed">Fixed</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          px
          <input type="number" disabled={mode !== "fixed"} value={value ?? ""} onChange={(event) => update({ [axis]: { mode: "fixed", value: Number(event.target.value) } })} className={fieldClass()} />
        </label>
      </div>
    );
  };
  if (!target) return <SidebarContent><p className="p-3 text-sm text-muted-foreground">Select an artboard or Element.</p></SidebarContent>;
  const frame = target.type === "frame" ? (target as FrameElement) : null;
  const parentInfo = canvasElementParent(focused!.canvas.root, target.id);
  const parent = parentInfo ? findCanvasElement(focused!.canvas.root, parentInfo.parentId) : null;
  const absolute = !parent || parent.type !== "frame" || (parent.layoutMode ?? parent.mode) !== "auto";
  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>{elements.length > 1 ? `${elements.length} Elements` : "Selection"}</SidebarGroupLabel>
        <SidebarGroupContent className="flex flex-col gap-3 p-3">
          <label className="flex flex-col gap-1 text-xs">Name<input value={text("name")} onChange={(event) => update({ name: event.target.value })} className={fieldClass()} /></label>
          <label className="flex items-center justify-between gap-2 text-xs">Visible<input type="checkbox" checked={common("hidden") !== true} onChange={(event) => update({ hidden: !event.target.checked })} /></label>
          <label className="flex flex-col gap-1 text-xs">Opacity<input type="number" min="0" max="1" step="0.05" value={text("opacity", "1")} onChange={(event) => update({ opacity: Number(event.target.value) })} className={fieldClass()} /></label>
          {sizeField("width")}{sizeField("height")}
          {absolute && target.anchor ? <div className="grid grid-cols-2 gap-2"><label className="flex flex-col gap-1 text-xs">X<input type="number" value={target.anchor.offsetX ?? 0} onChange={(event) => update({ anchor: { ...target.anchor, offsetX: Number(event.target.value) } })} className={fieldClass()} /></label><label className="flex flex-col gap-1 text-xs">Y<input type="number" value={target.anchor.offsetY ?? 0} onChange={(event) => update({ anchor: { ...target.anchor, offsetY: Number(event.target.value) } })} className={fieldClass()} /></label></div> : null}
        </SidebarGroupContent>
      </SidebarGroup>
      {frame ? <SidebarGroup><SidebarGroupLabel>Frame layout</SidebarGroupLabel><SidebarGroupContent className="flex flex-col gap-3 p-3">
        <label className="flex flex-col gap-1 text-xs">Mode<select value={frame.layoutMode ?? frame.mode ?? "absolute"} onChange={(event) => update({ layoutMode: event.target.value })} className={fieldClass()}><option value="absolute">Absolute</option><option value="auto">Auto layout</option></select></label>
        <label className="flex flex-col gap-1 text-xs">Direction<select value={frame.direction ?? "vertical"} onChange={(event) => update({ direction: event.target.value })} className={fieldClass()}><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option></select></label>
        <label className="flex flex-col gap-1 text-xs">Gap<input type="number" value={frame.gap ?? 0} onChange={(event) => update({ gap: Number(event.target.value) })} className={fieldClass()} /></label>
        <label className="flex items-center justify-between gap-2 text-xs">Clip content<input type="checkbox" checked={frame.clip === true} onChange={(event) => update({ clip: event.target.checked })} /></label>
      </SidebarGroupContent></SidebarGroup> : null}
      {target.type === "text" ? <SidebarGroup><SidebarGroupLabel>Text</SidebarGroupLabel><SidebarGroupContent className="flex flex-col gap-3 p-3"><label className="flex flex-col gap-1 text-xs">Content<textarea value={text("content", target.text ?? "")} onChange={(event) => update({ content: event.target.value })} className="min-h-20 rounded-md border border-border bg-background p-2" /></label><label className="flex flex-col gap-1 text-xs">Font size<input type="number" value={text("fontSize", "16")} onChange={(event) => update({ fontSize: Number(event.target.value) })} className={fieldClass()} /></label></SidebarGroupContent></SidebarGroup> : null}
      {target.type === "rect" ? <SidebarGroup><SidebarGroupLabel>Rectangle</SidebarGroupLabel><SidebarGroupContent className="p-3"><label className="flex flex-col gap-1 text-xs">Corner radius<input type="number" value={target.cornerRadius ?? 0} onChange={(event) => update({ cornerRadius: Number(event.target.value) })} className={fieldClass()} /></label></SidebarGroupContent></SidebarGroup> : null}
      {target.type === "image" ? <SidebarGroup><SidebarGroupLabel>Image</SidebarGroupLabel><SidebarGroupContent className="p-3"><label className="flex flex-col gap-1 text-xs">Object fit<select value={target.objectFit ?? "fill"} onChange={(event) => update({ objectFit: event.target.value })} className={fieldClass()}><option value="fill">Fill</option><option value="contain">Contain</option><option value="cover">Cover</option><option value="none">None</option><option value="scale-down">Scale down</option></select></label></SidebarGroupContent></SidebarGroup> : null}
    </SidebarContent>
  );
}

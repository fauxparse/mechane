import type { ChangeEvent } from "react";
import type {
  FrameElement,
  PropertyConnection,
  SceneVariable,
  ShapeValue,
  Type,
  VariableReference,
} from "@mechane/domain";
import {
  CANVAS_PROPERTY_DESCRIPTORS,
  canvasPropertyDescriptor,
  defaultPropertyValue,
  isPropertyConnection,
  opacityFromPercent,
  opacityToPercent,
  propertyCoercion,
} from "@mechane/domain";
import {
  PropertyInput,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@mechane/design-system";
import type { PropertyInputValue } from "@mechane/design-system";

import type { CanvasArtboardDocument } from "../../../api/canvas";
import { canvasElementParent, findCanvasElement } from "@mechane/commands";
import type { CanvasSelection } from "./canvas-selection";

type Props = {
  focused: CanvasArtboardDocument | null;
  selection: CanvasSelection;
  variables?: readonly SceneVariable[];
  onUpdateElement?(
    canvasId: string,
    elementId: string,
    properties: Record<string, unknown>,
    unsetProperties?: readonly string[],
  ): void;
  onUpdateElements?(
    canvasId: string,
    updates: readonly {
      readonly elementId: string;
      readonly properties: Record<string, unknown>;
      readonly unsetProperties?: readonly string[];
    }[],
  ): void;
};


function fieldClass(): string {
  return "h-8 rounded-md border border-border bg-background px-2";
}

function parseNumber(value: string): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function inputType(type: Type): "text" | "number" | "color" | null {
  if (type === "number") return "number";
  if (type === "colour") return "color";
  if (type === "text" || type === "image") return "text";
  return null;
}

function literalValue(type: Type, value: unknown): ShapeValue | null {
  if (value === undefined || value === null || typeof type !== "string") return null;
  if (value && typeof value === "object" && "kind" in value && "value" in value)
    return value as ShapeValue;
  const kind = type === "colour" ? "colour" : type;
  if (
    kind === "number" ||
    kind === "text" ||
    kind === "image" ||
    kind === "colour" ||
    kind === "boolean" ||
    kind === "date" ||
    kind === "datetime"
  ) {
    return { kind, value } as ShapeValue;
  }
  return null;
}

function variableInput(
  value: unknown,
  type: Type,
  variables: readonly SceneVariable[],
): PropertyInputValue | null {
  if (isPropertyConnection(value)) {
    const variable = variables.find((candidate) => candidate.id === value.variableId);
    if (!variable) return null;
    return {
      ...variable,
      current: variable.type ? defaultPropertyValue(variable.type) ?? undefined : undefined,
    };
  }
  return literalValue(type, value);
}

function isVariableInput(value: PropertyInputValue | null): value is VariableReference {
  return (
    value !== null &&
    typeof value === "object" &&
    "id" in value &&
    "name" in value
  );
}

function sameValue(left: unknown, right: unknown): boolean {
  if (isPropertyConnection(left) || isPropertyConnection(right)) {
    return (
      isPropertyConnection(left) &&
      isPropertyConnection(right) &&
      left.variableId === right.variableId
    );
  }
  return Object.is(left, right);
}

function opacityInputValue(value: PropertyInputValue | null): PropertyInputValue | null {
  if (isVariableInput(value)) {
    const current = value.current;
    return {
      ...value,
      current:
        current?.kind === "number"
          ? { ...current, value: opacityToPercent(current.value) }
          : current,
    };
  }
  return value?.kind === "number"
    ? { ...value, value: opacityToPercent(value.value) }
    : value;
}

function sizeInputValue(
  size: unknown,
  variables: readonly SceneVariable[],
): PropertyInputValue | null {
  if (!size || typeof size !== "object") return null;
  const raw = (size as { value?: unknown }).value;
  if (isPropertyConnection(raw)) return variableInput(raw, "number", variables);
  if (typeof raw === "number") return literalValue("number", raw);
  if (raw && typeof raw === "object" && "value" in raw) {
    return literalValue("number", (raw as { value?: unknown }).value);
  }
  return null;
}

export function CanvasInspector({
  focused,
  selection,
  variables = [],
  onUpdateElement,
  onUpdateElements,
}: Props) {
  const elements =
    focused && selection.artId === focused.artId
      ? selection.elementIds.flatMap((id) => {
          const element = findCanvasElement(focused.canvas.root, id);
          return element ? [element] : [];
        })
      : [];
  const target =
    elements[0] ?? (focused && selection.artId === focused.artId ? focused.canvas.root : null);
  const common = (property: string): unknown => {
    const selected = elements.length > 0 ? elements : target ? [target] : [];
    if (selected.length === 0) return undefined;
    const first = (selected[0] as unknown as Record<string, unknown>)[property];
    return selected.every((element) =>
      sameValue((element as unknown as Record<string, unknown>)[property], first),
    )
      ? first
      : undefined;
  };
  const update = (properties: Record<string, unknown>, unset: readonly string[] = []) => {
    if (!focused) return;
    const selected = elements.length > 0 ? elements : target ? [target] : [];
    const updates = selected.map((element) => ({
      elementId: element.id,
      properties,
      ...(unset.length > 0 ? { unsetProperties: unset } : {}),
    }));
    if (onUpdateElements) onUpdateElements(focused.canvasId, updates);
    else
      for (const item of updates)
        onUpdateElement?.(focused.canvasId, item.elementId, properties, unset);
  };
  const updateNumber =
    (makeProperties: (value: number) => Record<string, unknown>) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = parseNumber(event.target.value);
      if (value !== null) update(makeProperties(value));
    };
  const text = (property: string, fallback = "") => {
    const value = common(property);
    return value === undefined ? fallback : String(value ?? "");
  };
  const propertyField = (name: (typeof CANVAS_PROPERTY_DESCRIPTORS)[number]["name"]) => {
    if (!target) return null;
    const descriptor = canvasPropertyDescriptor(name, target);
    if (!descriptor) return null;
    if (elements.length > 0 && !elements.every((element) => canvasPropertyDescriptor(name, element))) {
      return null;
    }
    const type = inputType(descriptor.targetType);
    if (!type) return null;
    const value = opacityInputValue(variableInput(common(name), descriptor.targetType, variables));
    const availableVariables = variables.filter(
      (variable) => variable.type && propertyCoercion(variable.type, descriptor.targetType),
    );
    return (
      <label className="flex flex-col gap-1 text-xs" key={name}>
        {name}
        <PropertyInput
          type={type}
          value={value}
          variables={availableVariables}
          min={name === "opacity" ? 0 : undefined}
          max={name === "opacity" ? 100 : undefined}
          step={name === "opacity" ? 1 : undefined}
          onChange={(next) => {
            if (isVariableInput(next)) {
              update({
                [name]: { kind: "variable", variableId: next.id } satisfies PropertyConnection,
              });
            } else if (next === null) {
              update({}, [name]);
            } else {
              const nextValue =
                name === "opacity" && next.kind === "number"
                  ? opacityFromPercent(next.value)
                  : next.value;
              update({ [name]: nextValue });
            }
          }}
        />
      </label>
    );
  };
  const parentInfo = target && focused ? canvasElementParent(focused.canvas.root, target.id) : null;
  const parent =
    parentInfo && focused ? findCanvasElement(focused.canvas.root, parentInfo.parentId) : null;
  // "Fill" means "fill the remaining space on the parent's layout axis", which only exists inside
  // an auto-layout Frame. Absolutely positioned Elements have no such axis to fill.
  const absolute =
    !parent || parent.type !== "frame" || (parent.layoutMode ?? parent.mode) !== "auto";
  const sizeField = (axis: "width" | "height") => {
    if (!target) return null;
    const size = target[axis];
    const mode = size?.mode ?? "hug";
    const unit =
      size?.value &&
      typeof size.value === "object" &&
      "unit" in size.value &&
      size.value.unit === "%"
        ? "%"
        : "px";
    const sizeVariables = variables.filter((variable) => variable.type === "number");
    return (
      <label className="flex flex-col gap-1 text-xs" key={axis}>
        {axis}
        <PropertyInput
          icon={axis === "width" ? "W" : "H"}
          type="number"
          dimension={axis}
          unit={unit}
          value={sizeInputValue(size, sizeVariables)}
          sizing={mode}
          variables={sizeVariables}
          min={0}
          onSizingChange={(nextMode) =>
            update({
              [axis]: {
                ...size,
                mode: nextMode,
                ...(nextMode === "fixed" && size?.value === undefined ? { value: 100 } : {}),
              },
            })
          }
          onChange={(next) => {
            if (isVariableInput(next)) {
              update({
                [axis]: {
                  ...size,
                  mode: "fixed",
                  value: { kind: "variable", variableId: next.id } satisfies PropertyConnection,
                },
              });
            } else if (next?.kind === "number") {
              update({
                [axis]: {
                  ...size,
                  mode: "fixed",
                  value: unit === "%" ? { value: next.value, unit } : next.value,
                },
              });
            }
          }}
        />
      </label>
    );
  };
  if (!target)
    return (
      <SidebarContent>
        <p className="p-3 text-sm text-muted-foreground">Select an artboard or Element.</p>
      </SidebarContent>
    );
  const frame = target.type === "frame" ? (target as FrameElement) : null;
  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>
          {elements.length > 1 ? `${elements.length} Elements` : "Selection"}
        </SidebarGroupLabel>
        <SidebarGroupContent className="flex flex-col gap-3 p-3">
          <label className="flex flex-col gap-1 text-xs">
            Name
            <input
              value={text("name")}
              onChange={(event) => update({ name: event.target.value })}
              className={fieldClass()}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs">
            Visible
            <input
              type="checkbox"
              checked={common("hidden") !== true}
              onChange={(event) => update({ hidden: !event.target.checked })}
            />
          </label>
          {propertyField("opacity")}
          {propertyField("fill")}
          {sizeField("width")}
          {sizeField("height")}
          {absolute && target.anchor ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs">
                X
                <input
                  type="number"
                  value={target.anchor.offsetX ?? 0}
                  onChange={updateNumber((value) => ({
                    anchor: { ...target.anchor, offsetX: value },
                  }))}
                  className={fieldClass()}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Y
                <input
                  type="number"
                  value={target.anchor.offsetY ?? 0}
                  onChange={updateNumber((value) => ({
                    anchor: { ...target.anchor, offsetY: value },
                  }))}
                  className={fieldClass()}
                />
              </label>
            </div>
          ) : null}
        </SidebarGroupContent>
      </SidebarGroup>
      {frame ? (
        <SidebarGroup>
          <SidebarGroupLabel>Frame layout</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-3 p-3">
            <label className="flex flex-col gap-1 text-xs">
              Mode
              <select
                value={frame.layoutMode ?? frame.mode ?? "absolute"}
                onChange={(event) => update({ layoutMode: event.target.value })}
                className={fieldClass()}
              >
                <option value="absolute">Absolute</option>
                <option value="auto">Auto layout</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Direction
              <select
                value={frame.direction ?? "vertical"}
                onChange={(event) => update({ direction: event.target.value })}
                className={fieldClass()}
              >
                <option value="vertical">Vertical</option>
                <option value="horizontal">Horizontal</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Gap
              <input
                type="number"
                value={frame.gap ?? 0}
                onChange={updateNumber((value) => ({ gap: value }))}
                className={fieldClass()}
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-xs">
              Clip content
              <input
                type="checkbox"
                checked={frame.clip === true}
                onChange={(event) => update({ clip: event.target.checked })}
              />
            </label>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
      {target.type === "text" ? (
        <SidebarGroup>
          <SidebarGroupLabel>Text</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-3 p-3">
            {propertyField("content")}
            {propertyField("color")}
            {propertyField("fontFamily")}
            {propertyField("fontSize")}
            {propertyField("textAlign")}
            {propertyField("letterSpacing")}
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
      {target.type === "rect" ? (
        <SidebarGroup>
          <SidebarGroupLabel>Rectangle</SidebarGroupLabel>
          <SidebarGroupContent className="p-3">
            {propertyField("cornerRadius")}
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
      {target.type === "image" ? (
        <SidebarGroup>
          <SidebarGroupLabel>Image</SidebarGroupLabel>
          <SidebarGroupContent className="p-3">
            {propertyField("src")}
            {propertyField("alt")}
            {propertyField("objectFit")}
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
    </SidebarContent>
  );
}

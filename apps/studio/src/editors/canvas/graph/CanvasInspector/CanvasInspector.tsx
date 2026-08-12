import { createContext, useContext, type ChangeEvent } from "react";
import type {
  Element,
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
  EyeClosedIcon,
  EyeIcon,
  Link2Icon,
  LucideIcon,
  PropertyInput,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SquareRoundCornerIcon,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Unlink2Icon,
} from "@mechane/design-system";
import type { PropertyInputValue } from "@mechane/design-system";

import type { CanvasArtboardDocument } from "../../../../api/canvas";
import { canvasElementParent, findCanvasElement } from "@mechane/commands";
import { lockedAspectRatio } from "../../commands/canvas-resize";
import { canvasDisplayName, canvasElementDisplayName } from "../../data/canvas-names";
import type { CanvasSelection } from "../canvas-selection";
import { Section, SectionRow } from "./Section";
import { elementIconFor } from "../utils";

type CanvasInspectorPreview = {
  elementId: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type Props = {
  focused: CanvasArtboardDocument | null;
  selection: CanvasSelection;
  variables?: readonly SceneVariable[];
  inspectorPreview?: CanvasInspectorPreview | null;
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
  if (type === "color") return "color";
  if (type === "text" || type === "image") return "text";
  return null;
}

function literalValue(type: Type, value: unknown): ShapeValue | null {
  if (value === undefined || value === null || typeof type !== "string") return null;
  if (value && typeof value === "object" && "kind" in value && "value" in value)
    return value as ShapeValue;
  const kind = type === "color" ? "color" : type;
  if (
    kind === "number" ||
    kind === "text" ||
    kind === "image" ||
    kind === "color" ||
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
      current: variable.type ? (defaultPropertyValue(variable.type) ?? undefined) : undefined,
    };
  }
  return literalValue(type, value);
}

function isVariableInput(value: PropertyInputValue | null): value is VariableReference {
  return value !== null && typeof value === "object" && "id" in value && "name" in value;
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
  return value?.kind === "number" ? { ...value, value: opacityToPercent(value.value) } : value;
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
function numericSizeValue(size: unknown): number | null {
  if (!size || typeof size !== "object" || !("value" in size)) return null;
  const value = size.value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value === "object" && "value" in value) {
    const nestedValue = value.value;
    return typeof nestedValue === "number" && Number.isFinite(nestedValue) ? nestedValue : null;
  }
  return null;
}

type InspectorUpdate = (properties: Record<string, unknown>, unset?: readonly string[]) => void;

type CanvasInspectorContextValue = {
  target: Element;
  elements: readonly Element[];
  selected: readonly Element[];
  variables: readonly SceneVariable[];
  inspectorPreview: CanvasInspectorPreview | null;
  common: (property: string) => unknown;
  update: InspectorUpdate;
  text: (property: string, fallback?: string) => string;
};

const CanvasInspectorContext = createContext<CanvasInspectorContextValue | null>(null);

function useCanvasInspectorContext(): CanvasInspectorContextValue {
  const context = useContext(CanvasInspectorContext);
  if (!context) throw new Error("Canvas inspector fields must be rendered inside CanvasInspector.");
  return context;
}

type PropertyFieldProps = {
  name: (typeof CANVAS_PROPERTY_DESCRIPTORS)[number]["name"];
  icon?: LucideIcon | string;
};

function PropertyField({ name, icon }: PropertyFieldProps) {
  const { target, elements, selected, variables, common, update } = useCanvasInspectorContext();
  const descriptor = canvasPropertyDescriptor(name, target);
  if (!descriptor) return null;
  if (elements.length > 0 && !elements.every((element) => canvasPropertyDescriptor(name, element)))
    return null;

  const rawValue = common(name);
  const isUnset =
    rawValue === undefined &&
    selected.length > 0 &&
    selected.every(
      (element) => (element as unknown as Record<string, unknown>)[name] === undefined,
    );
  const defaultValue = isUnset
    ? name === "opacity"
      ? 1
      : name === "cornerRadius"
        ? 0
        : undefined
    : rawValue;
  const value =
    name === "opacity"
      ? opacityInputValue(variableInput(defaultValue, descriptor.targetType, variables))
      : variableInput(defaultValue, descriptor.targetType, variables);
  const type = inputType(descriptor.targetType);
  if (!type) return null;
  const availableVariables = variables.filter(
    (variable) => variable.type && propertyCoercion(variable.type, descriptor.targetType),
  );

  return (
    <PropertyInput
      type={type}
      value={value}
      variables={availableVariables}
      unit={name === "opacity" ? "%" : undefined}
      icon={icon}
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
  );
}

type SizeFieldProps = {
  axis: "width" | "height";
};

function SizeField({ axis }: SizeFieldProps) {
  const { target, variables, inspectorPreview, update } = useCanvasInspectorContext();
  const size = target[axis];
  const previewValue =
    inspectorPreview?.elementId === target.id ? inspectorPreview[axis] : undefined;
  const previewing = previewValue !== undefined;
  const mode = previewing ? "fixed" : (size?.mode ?? "hug");
  const unit = previewing
    ? "px"
    : size?.value &&
        typeof size.value === "object" &&
        "unit" in size.value &&
        size.value.unit === "%"
      ? "%"
      : "px";
  const sizeVariables = variables.filter((variable) => variable.type === "number");

  return (
    <PropertyInput
      icon={axis === "width" ? "W" : "H"}
      type="number"
      dimension={axis}
      unit={unit}
      placeholder={mode === "fill" ? "Fill" : mode === "hug" ? "Hug" : undefined}
      value={
        previewing ? literalValue("number", previewValue) : sizeInputValue(size, sizeVariables)
      }
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
  );
}

export function CanvasInspector({
  focused,
  selection,
  variables = [],
  inspectorPreview = null,
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
  const selected = elements.length > 0 ? elements : target ? [target] : [];
  const common = (property: string): unknown => {
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
  const parentInfo = target && focused ? canvasElementParent(focused.canvas.root, target.id) : null;
  const parent =
    parentInfo && focused ? findCanvasElement(focused.canvas.root, parentInfo.parentId) : null;
  // "Fill" means "fill the remaining space on the parent's layout axis", which only exists inside
  // an auto-layout Frame. Absolutely positioned Elements have no such axis to fill.
  const absolute =
    !parent || parent.type !== "frame" || (parent.layoutMode ?? parent.mode) !== "auto";
  if (!target)
    return (
      <SidebarContent>
        <p className="p-3 text-sm text-muted-foreground">Select an artboard or Element.</p>
      </SidebarContent>
    );
  const frame = target.type === "frame" ? (target as FrameElement) : null;
  const Icon = elementIconFor(elements.map((e) => e.type));
  const isAspectRatioLocked = lockedAspectRatio(target) !== null;
  const setAspectRatioLock = (locked: boolean) => {
    if (!focused) return;
    if (!locked) {
      if (target.layout?.aspectRatio) {
        const { aspectRatio: _aspectRatio, ...layout } = target.layout;
        update({ layout }, ["aspectRatio"]);
      } else {
        update({}, ["aspectRatio"]);
      }
      return;
    }
    const width = numericSizeValue(target.layout?.width ?? target.sizing?.width ?? target.width);
    const height = numericSizeValue(
      target.layout?.height ?? target.sizing?.height ?? target.height,
    );
    if (width === null || height === null || width <= 0 || height <= 0) return;
    const aspectRatio = { ratio: width / height, driver: "width" as const };
    if (target.layout) {
      update({ layout: { ...target.layout, aspectRatio } }, ["aspectRatio"]);
    } else {
      update({ aspectRatio });
    }
  };

  return (
    <CanvasInspectorContext.Provider
      value={{ target, elements, selected, variables, inspectorPreview, common, update, text }}
    >
      <>
        <SidebarHeader className="border-0">
          <div className="flex items-center gap-2">
            <Icon className="size-6" />
            {elements.length > 1
              ? `${elements.length} Elements`
              : elements[0]
                ? canvasElementDisplayName(elements[0])
                : focused
                  ? canvasDisplayName(focused)
                  : "Selection"}
          </div>
        </SidebarHeader>
        <SidebarContent className="p-0 gap-0">
          {absolute && target.anchor ? (
            <Section label="Position">
              <SectionRow>
                <PropertyInput
                  icon="X"
                  type="number"
                  value={{
                    kind: "number",
                    value:
                      inspectorPreview?.elementId === target.id && inspectorPreview.x !== undefined
                        ? inspectorPreview.x
                        : (target.anchor.offsetX ?? 0),
                  }}
                  onChange={(next) => {
                    if (!isVariableInput(next) && next?.kind === "number") {
                      update({
                        anchor: { ...target.anchor, offsetX: next.value },
                      });
                    }
                  }}
                />
                <PropertyInput
                  icon="Y"
                  type="number"
                  value={{
                    kind: "number",
                    value:
                      inspectorPreview?.elementId === target.id && inspectorPreview.y !== undefined
                        ? inspectorPreview.y
                        : (target.anchor.offsetY ?? 0),
                  }}
                  onChange={(next) => {
                    if (!isVariableInput(next) && next?.kind === "number") {
                      update({
                        anchor: { ...target.anchor, offsetY: next.value },
                      });
                    }
                  }}
                />
              </SectionRow>
            </Section>
          ) : null}
          <Section label="Layout">
            <SectionRow>
              <SizeField axis="width" />
              <SizeField axis="height" />
              <Toggle
                aria-label={`${isAspectRatioLocked ? "Unlock" : "Lock"} aspect ratio`}
                pressed={isAspectRatioLocked}
                onPressedChange={setAspectRatioLock}
                size="sm"
              >
                {isAspectRatioLocked ? <Link2Icon /> : <Unlink2Icon />}
              </Toggle>
            </SectionRow>
          </Section>
          <Section
            label="Appearance"
            buttons={
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Toggle
                      size="sm"
                      className="p-0 size-7"
                      pressed={common("hidden") === true}
                      onPressedChange={(hidden) => update({ hidden })}
                    >
                      {common("hidden") === true ? <EyeClosedIcon /> : <EyeIcon />}
                    </Toggle>
                  }
                />
                <TooltipContent>{common("hidden") === true ? "Show" : "Hide"}</TooltipContent>
              </Tooltip>
            }
          >
            <SectionRow>
              <PropertyField name="opacity" icon={EyeIcon} />
              {target.type === "rect" && (
                <PropertyField name="cornerRadius" icon={SquareRoundCornerIcon} />
              )}
            </SectionRow>
          </Section>
          <SidebarGroup className="p-0">
            <SidebarGroupLabel></SidebarGroupLabel>
            <SidebarGroupContent className="flex flex-col gap-3 p-0">
              <label className="flex flex-col gap-1 text-xs">
                Name
                <input
                  value={text("name")}
                  onChange={(event) => update({ name: event.target.value })}
                  className={fieldClass()}
                />
              </label>
              <PropertyField name="fill" />
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
                <PropertyField name="content" />
                <PropertyField name="color" />
                <PropertyField name="fontFamily" />
                <PropertyField name="fontSize" />
                <PropertyField name="textAlign" />
                <PropertyField name="letterSpacing" />
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}
          {target.type === "image" ? (
            <SidebarGroup>
              <SidebarGroupLabel>Image</SidebarGroupLabel>
              <SidebarGroupContent className="p-3">
                <PropertyField name="src" />
                <PropertyField name="alt" />
                <PropertyField name="objectFit" />
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}
        </SidebarContent>
      </>
    </CanvasInspectorContext.Provider>
  );
}

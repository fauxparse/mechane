import {
  EyeClosedIcon,
  EyeIcon,
  LayoutHorizontalIcon,
  LayoutNoneIcon,
  LayoutVerticalIcon,
  Link2Icon,
  PropertyInput,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SquareRoundCornerIcon,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Unlink2Icon,
} from "@mechane/design-system";

import { canvasDisplayName, canvasElementDisplayName } from "../../data/canvas-names";
import { elementIconFor } from "../utils";
import { Section, SectionRow } from "./Section";
import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { PropertyField, SizeField } from "./CanvasInspectorFields";
import { isVariableInput } from "./canvas-inspector-values";
import { AlignmentSelector } from "./AlignmentSelector";

function fieldClass(): string {
  return "h-8 rounded-md border border-border bg-background px-2";
}

function parseNumber(value: string): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

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
      <Icon className="size-6" />
      {label}
    </div>
  );
}

export function PositionSection() {
  const { target, absolute, inspectorPreview, update } = useCanvasInspectorContext();
  if (!absolute || !target.anchor) return null;

  return (
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
              update({ anchor: { ...target.anchor, offsetX: next.value } });
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
              update({ anchor: { ...target.anchor, offsetY: next.value } });
            }
          }}
        />
      </SectionRow>
    </Section>
  );
}

export function LayoutSection() {
  const { target, update, isAspectRatioLocked, setAspectRatioLock } = useCanvasInspectorContext();
  const frame = target.type === "frame" ? target : null;

  return (
    <Section label="Layout">
      {frame && (
        <SectionRow>
          <ToggleGroup
            className="bg-muted/50 w-full *:grow"
            spacing={0}
            value={[frame.layoutMode === "auto" ? (frame.direction ?? "horizontal") : "absolute"]}
            onValueChange={([value]) => {
              switch (value) {
                case "horizontal":
                case "vertical":
                  update({ layoutMode: "auto", direction: value });
                  break;
                default:
                  update({ layoutMode: "absolute", direction: null });
              }
            }}
          >
            <ToggleGroupItem value="absolute" size="sm">
              <LayoutNoneIcon />
            </ToggleGroupItem>
            <ToggleGroupItem value="horizontal" size="sm">
              <LayoutHorizontalIcon />
            </ToggleGroupItem>
            <ToggleGroupItem value="vertical" size="sm">
              <LayoutVerticalIcon />
            </ToggleGroupItem>
          </ToggleGroup>
        </SectionRow>
      )}
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
      {frame?.layoutMode === "auto" && (
        <SectionRow>
          <AlignmentSelector
            direction={frame.direction ?? "horizontal"}
            alignPrimary={frame.alignPrimary ?? "start"}
            alignCounter={frame.alignCounter ?? "start"}
            onChange={(props) => update(props)}
          />
        </SectionRow>
      )}
    </Section>
  );
}

export function AppearanceSection() {
  const { target, common, update } = useCanvasInspectorContext();

  return (
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
  );
}

export function PropertiesSection() {
  const { text, update } = useCanvasInspectorContext();

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupLabel className="sr-only">Properties</SidebarGroupLabel>
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
  );
}

export function FrameSection() {
  const { target, update } = useCanvasInspectorContext();
  if (target.type !== "frame") return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Frame layout</SidebarGroupLabel>
      <SidebarGroupContent className="flex flex-col gap-3 p-3">
        <label className="flex flex-col gap-1 text-xs">
          Gap
          <input
            type="number"
            value={target.gap ?? 0}
            onChange={(event) => {
              const value = parseNumber(event.target.value);
              if (value !== null) update({ gap: value });
            }}
            className={fieldClass()}
          />
        </label>
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

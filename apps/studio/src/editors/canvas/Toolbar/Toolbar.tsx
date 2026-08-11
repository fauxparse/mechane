// The Canvas editor's toolbar. Lives in the Editor Chrome's footer slot, so it
// floats over the bottom of the plane rather than sitting inside it.
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Separator,
  ToggleGroup,
  ToggleGroupItem,
} from "@mechane/design-system";
import {
  FrameIcon,
  ImageIcon,
  MinusIcon,
  MousePointerIcon,
  PlusIcon,
  RotateCcwIcon,
  SquareIcon,
  TypeIcon,
} from "lucide-react";

/** The tools the Canvas editor can be in. Exactly one is active at a time. */
export type CanvasTool = "select" | "rect" | "text" | "image" | "frame";

const TOOLS: { value: CanvasTool; label: string; Icon: typeof MousePointerIcon }[] = [
  { value: "select", label: "Select", Icon: MousePointerIcon },
  { value: "rect", label: "Rectangle", Icon: SquareIcon },
  { value: "text", label: "Text", Icon: TypeIcon },
  { value: "image", label: "Image", Icon: ImageIcon },
  { value: "frame", label: "Frame", Icon: FrameIcon },
];

export interface ToolbarProps {
  tool: CanvasTool;
  onToolChange(tool: CanvasTool): void;
  /** Camera zoom as a multiplier — 1 is 1:1. */
  zoom: number;
  onZoomIn(): void;
  onZoomOut(): void;
  onResetView(): void;
}

export const Toolbar = ({
  tool,
  onToolChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetView,
}: ToolbarProps) => {
  return (
    <div
      className="pointer-events-auto flex items-center gap-2 rounded-xl border border-border bg-muted/50 backdrop-blur-sm p-1 shadow-lg"
      role="toolbar"
      aria-label="Canvas tools"
    >
      {/*
        Single-select: a tool is a mode, so the array form ToggleGroup defaults
        to would let two be pressed at once.
      */}
      <ToggleGroup
        value={[tool]}
        onValueChange={(value) => {
          const [next] = value as CanvasTool[];
          // An empty array means the active tool was pressed again. There is no
          // "no tool" state, so that deselection is ignored.
          if (next) onToolChange(next);
        }}
        className="gap-1 *:aria-pressed:bg-primary *:aria-pressed:text-primary-foreground"
      >
        {TOOLS.map(({ value, label, Icon }) => (
          <ToggleGroupItem
            key={value}
            value={value}
            aria-label={label}
            title={label}
            className="p-0"
          >
            <Icon />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Separator
        orientation="vertical"
        className="data-[orientation=vertical]:h-6 data-[orientation=vertical]:self-center-safe"
      />
      <div className="flex-1 gap-1">
        <InputGroup className="border-0 bg-muted/50 dark:bg-muted/50">
          {/*
            Read-only: the camera exposes stepped zoom, not a setter, so there
            is nothing for a typed value to drive yet.
          */}
          <InputGroupInput
            readOnly
            aria-label="Zoom level"
            aria-live="polite"
            value={`${Math.round(zoom * 100)}%`}
            className="w-16"
          />
          <InputGroupAddon align="inline-end" className="flex gap-0">
            <InputGroupButton
              aria-label="Zoom out"
              title="Zoom out"
              size="icon-xs"
              onClick={onZoomOut}
            >
              <MinusIcon />
            </InputGroupButton>
            <InputGroupButton
              aria-label="Zoom in"
              title="Zoom in"
              size="icon-xs"
              onClick={onZoomIn}
            >
              <PlusIcon />
            </InputGroupButton>
            <InputGroupButton
              aria-label="Reset view"
              title="Reset view"
              size="icon-xs"
              onClick={onResetView}
            >
              <RotateCcwIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  );
};

import {
  Button,
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
  Minus,
  MinusIcon,
  MousePointerIcon,
  PlusIcon,
  RotateCcwIcon,
  SquareIcon,
  TypeIcon,
} from "lucide-react";

export const Toolbar = () => {
  return (
    <div className="flex items-center border border-border shadow-lg p-1 gap-2 rounded-xl bg-muted/50">
      <ToggleGroup
        defaultValue={["select"]}
        className="gap-1 *:aria-pressed:bg-primary *:aria-pressed:text-primary-foreground"
      >
        <ToggleGroupItem value="select" className="p-0">
          <MousePointerIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value="rect" className="p-0">
          <SquareIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value="text" className="p-0">
          <TypeIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value="image" className="p-0">
          <ImageIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value="frame" className="p-0">
          <FrameIcon />
        </ToggleGroupItem>
      </ToggleGroup>
      <Separator
        orientation="vertical"
        className="data-[orientation=vertical]:h-6 data-[orientation=vertical]:self-center-safe"
      />
      <div className="flex-1 gap-1">
        <InputGroup className="border-0 bg-muted/50 dark:bg-muted/35">
          <InputGroupInput value="100%" className="w-16" />
          <InputGroupAddon align="inline-end" className="flex gap-0">
            <InputGroupButton aria-label="Zoom out" title="Zoom out" size="icon-xs">
              <MinusIcon />
            </InputGroupButton>
            <InputGroupButton aria-label="Zoom in" title="Zoom in" size="icon-xs">
              <PlusIcon />
            </InputGroupButton>
            <InputGroupButton aria-label="Reset" title="Reset" size="icon-xs">
              <RotateCcwIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  );
};

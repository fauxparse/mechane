import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "../../lib/utils";

function TooltipProvider(props: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider {...props} />;
}

function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root {...props} />;
}

function TooltipTrigger({ className, ...props }: TooltipPrimitive.Trigger.Props) {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      className={cn("outline-none focus-visible:ring-2 focus-visible:ring-ring/50", className)}
      {...props}
    />
  );
}

interface TooltipContentProps extends TooltipPrimitive.Popup.Props {
  side?: TooltipPrimitive.Positioner.Props["side"];
  align?: TooltipPrimitive.Positioner.Props["align"];
  sideOffset?: TooltipPrimitive.Positioner.Props["sideOffset"];
  alignOffset?: TooltipPrimitive.Positioner.Props["alignOffset"];
}

function TooltipContent({
  className,
  side = "top",
  align = "center",
  sideOffset = 6,
  alignOffset = 0,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-100"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "max-w-xs rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md outline-none transition-[transform,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

function TooltipArrow({ className, ...props }: TooltipPrimitive.Arrow.Props) {
  return (
    <TooltipPrimitive.Arrow
      data-slot="tooltip-arrow"
      className={cn("fill-foreground", className)}
      {...props}
    />
  );
}

export { Tooltip, TooltipArrow, TooltipContent, TooltipProvider, TooltipTrigger };

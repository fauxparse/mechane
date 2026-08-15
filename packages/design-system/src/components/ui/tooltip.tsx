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
  children,
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
            "relative flex flex-col max-w-xs rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md outline-none transition-[transform,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        >
          <TooltipArrow />
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
function TooltipArrow({ className, ...props }: TooltipPrimitive.Arrow.Props) {
  return (
    <TooltipPrimitive.Arrow
      data-slot="tooltip-arrow"
      className={cn(
        "relative block size-3 overflow-clip data-[side=bottom]:-top-1 data-[side=left]:-right-1 data-[side=left]:rotate-90 data-[side=right]:-left-1 data-[side=right]:-rotate-90 data-[side=top]:-bottom-1 data-[side=top]:rotate-180 before:absolute before:inset-0 before:rotate-45 before:rounded-full before:bg-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Tooltip, TooltipArrow, TooltipContent, TooltipProvider, TooltipTrigger };

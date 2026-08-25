import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import type { CSSProperties } from "react";

import { useVibe, VibeProvider, type Vibe } from "../inspector-vibe";
import { cn } from "../../lib/utils";

function SliderRoot({
  className,
  vibe: vibeProp,
  ...props
}: SliderPrimitive.Root.Props & { vibe?: Vibe }) {
  const vibe = useVibe(vibeProp);
  return (
    <VibeProvider vibe={vibe}>
      <SliderPrimitive.Root data-slot="slider" data-vibe={vibe} className={className} {...props} />
    </VibeProvider>
  );
}

function SliderControl({ className, ...props }: SliderPrimitive.Control.Props) {
  return (
    <SliderPrimitive.Control
      data-slot="slider-control"
      className={cn("flex w-full touch-none items-center select-none", className)}
      {...props}
    />
  );
}

function SliderTrack({ className, ...props }: SliderPrimitive.Track.Props) {
  const vibe = useVibe();
  return (
    <SliderPrimitive.Track
      data-slot="slider-track"
      className={cn(
        "relative h-2 w-full rounded-full select-none",
        vibe === "inspector" && "h-1.5",
        className,
      )}
      {...props}
    />
  );
}

function SliderIndicator({ className, ...props }: SliderPrimitive.Indicator.Props) {
  return (
    <SliderPrimitive.Indicator
      data-slot="slider-indicator"
      className={cn("absolute inset-y-0 rounded-full bg-primary", className)}
      {...props}
    />
  );
}

function SliderThumb({ className, style, ...props }: SliderPrimitive.Thumb.Props) {
  const vibe = useVibe();
  return (
    <SliderPrimitive.Thumb
      data-slot="slider-thumb"
      className={cn(
        "block size-4 shrink-0 rounded-full border border-border bg-background shadow-sm",
        vibe === "inspector" && "size-3.5",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      style={style as CSSProperties}
      {...props}
    />
  );
}

export const Slider = {
  Root: SliderRoot,
  Control: SliderControl,
  Track: SliderTrack,
  Indicator: SliderIndicator,
  Thumb: SliderThumb,
};

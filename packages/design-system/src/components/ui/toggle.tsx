import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { useVibe, type Vibe } from "../inspector-vibe";
import { cn } from "../../lib/utils";
import { Ref } from "react";

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-lg text-sm font-medium whitespace-nowrap transition-all outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-muted data-[state=on]:bg-muted dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent hover:bg-muted",
      },
      size: {
        default:
          "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-7 min-w-6 rounded-sm px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant,
  size,
  vibe: vibeProp,
  ref,
  ...props
}: TogglePrimitive.Props &
  VariantProps<typeof toggleVariants> & {
    vibe?: Vibe;
    ref?: Ref<"button">;
  }) {
  const vibe = useVibe(vibeProp);
  const resolvedSize = size ?? (vibe === "inspector" ? "sm" : "default");
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(
        toggleVariants({ variant: variant ?? "default", size: resolvedSize }),
        vibe === "inspector" && "rounded-sm",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };

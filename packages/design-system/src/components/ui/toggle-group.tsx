import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { type VariantProps } from "class-variance-authority";
import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from "react";
import { useVibe, VibeProvider, type Vibe } from "../inspector-vibe";

import { cn } from "../../lib/utils";
import { toggleVariants } from "./toggle";

type ToggleGroupContextValue = VariantProps<typeof toggleVariants> & {
  spacing?: number;
  orientation?: "horizontal" | "vertical";
  vibe: Vibe;
};

const ToggleGroupContext = createContext<ToggleGroupContextValue>({
  size: "default",
  variant: "default",
  spacing: 2,
  orientation: "horizontal",
  vibe: "default",
});

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = "horizontal",
  vibe: vibeProp,
  children,
  ...props
}: ToggleGroupPrimitive.Props &
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
    orientation?: "horizontal" | "vertical";
    vibe?: Vibe;
    children?: ReactNode;
  }) {
  const vibe = useVibe(vibeProp);
  const resolvedSize = size ?? (vibe === "inspector" ? "sm" : undefined);
  const contextValue = useMemo(
    () => ({
      variant,
      size: resolvedSize,
      spacing,
      orientation,
      vibe,
    }),
    [variant, resolvedSize, spacing, orientation, vibe],
  );
  return (
    <VibeProvider vibe={vibe}>
      <ToggleGroupPrimitive
        data-slot="toggle-group"
        data-variant={variant}
        data-size={resolvedSize}
        data-spacing={spacing}
        data-orientation={orientation}
        style={{ "--gap": spacing } as CSSProperties}
        className={cn(
          "group/toggle-group flex *:grow w-fit p-0.5 flex-row items-center bg-muted/50 gap-[--spacing(var(--gap))] rounded-md data-[size=sm]:rounded-sm data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch *:data-[size=sm]:h-6 *:data-[size=sm]:min-w-6 *:rounded-md *:data-[size=sm]:rounded-xs",
          vibe === "inspector" && "rounded-sm",
          className,
        )}
        {...props}
      >
        <ToggleGroupContext.Provider value={contextValue}>{children}</ToggleGroupContext.Provider>
      </ToggleGroupPrimitive>
    </VibeProvider>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  vibe: vibeProp,
  ...props
}: TogglePrimitive.Props &
  VariantProps<typeof toggleVariants> & {
    vibe?: Vibe;
  }) {
  const context = useContext(ToggleGroupContext);
  const vibe = useVibe(vibeProp);
  const resolvedVariant = context.variant || variant || "default";
  const resolvedSize = context.size || size || (vibe === "inspector" ? "sm" : "default");

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={resolvedVariant}
      data-size={resolvedSize}
      data-spacing={context.spacing}
      className={cn(
        "shrink-0 h-6 group-data-[spacing=0]/toggle-group:px-2 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t",
        toggleVariants({ variant: resolvedVariant, size: resolvedSize }),
        vibe === "inspector" && "rounded-sm",
        className,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}

export { ToggleGroup, ToggleGroupItem };

// A dropdown menu: a trigger that opens a popup of actions. Wraps Base UI's
// Menu (which owns focus management, typeahead, and positioning) with this
// design system's tokens, the same way ./button.tsx wraps Base UI's Button.
//
// `DropdownMenuContent` collapses Base UI's Portal → Positioner → Popup
// trio into one component, because every consumer wants all three and the
// only knobs worth exposing are which side to open on and how far off the
// trigger. Reach for the parts directly if that ever stops being true.
import { Menu } from "@base-ui/react/menu";
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

function DropdownMenu(props: Menu.Root.Props) {
  return <Menu.Root {...props} />;
}

function DropdownMenuTrigger({ className, ...props }: Menu.Trigger.Props) {
  return <Menu.Trigger data-slot="dropdown-menu-trigger" className={className} {...props} />;
}

interface DropdownMenuContentProps extends Menu.Popup.Props {
  side?: Menu.Positioner.Props["side"];
  align?: Menu.Positioner.Props["align"];
  sideOffset?: Menu.Positioner.Props["sideOffset"];
  alignOffset?: Menu.Positioner.Props["alignOffset"];
}

function DropdownMenuContent({
  className,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  alignOffset = 0,
  ...props
}: DropdownMenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-100"
      >
        <Menu.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "z-100 min-w-40 origin-(--transform-origin) rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none transition-[transform,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

const dropdownMenuItemVariants = cva(
  "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-muted [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "text-popover-foreground",
        destructive: "text-destructive data-highlighted:bg-destructive/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: Menu.Item.Props & VariantProps<typeof dropdownMenuItemVariants>) {
  return (
    <Menu.Item
      data-slot="dropdown-menu-item"
      className={cn(dropdownMenuItemVariants({ variant, className }))}
      {...props}
    />
  );
}

function DropdownMenuGroup({ ...props }: Menu.Group.Props) {
  return <Menu.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuLabel({ className, ...props }: Menu.GroupLabel.Props) {
  return (
    <Menu.GroupLabel
      data-slot="dropdown-menu-label"
      className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  dropdownMenuItemVariants,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};

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
import { ChevronRightIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { menuItemClass, menuLabelClass, menuPopupClass, menuSeparatorClass } from "./menu-styles";

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
  sideOffset = 4,
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
          className={cn("z-100 min-w-40", menuPopupClass, className)}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

const dropdownMenuItemVariants = cva(menuItemClass, {
  variants: {
    variant: {
      default: "",
      destructive: "text-destructive data-highlighted:bg-destructive/10",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

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
      className={cn(menuLabelClass, className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="dropdown-menu-separator"
      className={cn(menuSeparatorClass, className)}
      {...props}
    />
  );
}
function DropdownMenuSubmenu(props: Menu.SubmenuRoot.Props) {
  return <Menu.SubmenuRoot {...props} />;
}

function DropdownMenuSubmenuTrigger({ className, children, ...props }: Menu.SubmenuTrigger.Props) {
  return (
    <Menu.SubmenuTrigger
      data-slot="dropdown-menu-submenu-trigger"
      className={cn(dropdownMenuItemVariants({ className }))}
      {...props}
    >
      <span className="flex-1">{children}</span>
      <ChevronRightIcon className="ml-auto size-4" />
    </Menu.SubmenuTrigger>
  );
}

function DropdownMenuSubmenuContent({ className, ...props }: Menu.Popup.Props) {
  return (
    <Menu.Portal>
      <Menu.Positioner side="inline-end" align="start" className="z-100 outline-none">
        <Menu.Popup
          data-slot="dropdown-menu-submenu-content"
          className={cn("z-100 min-w-40", menuPopupClass, className)}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
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
  DropdownMenuSubmenu,
  DropdownMenuSubmenuContent,
  DropdownMenuSubmenuTrigger,
  DropdownMenuTrigger,
};

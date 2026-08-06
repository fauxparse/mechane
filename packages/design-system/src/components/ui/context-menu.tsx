// A right-click menu. Same popup as ./dropdown-menu.tsx, opened by a
// secondary click on a region rather than by pressing a trigger, and
// positioned at the pointer — which is why this wraps Base UI's ContextMenu
// rather than being a prop on the dropdown: the anchor is the click, not an
// element.
//
// The submenu parts are exported because the graph editor's create menu is
// exactly that shape (a "Create" item opening a node-type list, #27).
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "../../lib/utils";
import { dropdownMenuItemVariants } from "./dropdown-menu";
import type { VariantProps } from "class-variance-authority";

function ContextMenu(props: ContextMenuPrimitive.Root.Props) {
  return <ContextMenuPrimitive.Root {...props} />;
}

/** The region a secondary click opens the menu on. Renders a `div` by default. */
function ContextMenuTrigger({ className, ...props }: ContextMenuPrimitive.Trigger.Props) {
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      className={className}
      {...props}
    />
  );
}

const POPUP_CLASS =
  "z-50 min-w-44 origin-(--transform-origin) rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none transition-[transform,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0";

function ContextMenuContent({ className, ...props }: ContextMenuPrimitive.Popup.Props) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner className="outline-none">
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-content"
          className={cn(POPUP_CLASS, className)}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

function ContextMenuItem({
  className,
  variant = "default",
  ...props
}: ContextMenuPrimitive.Item.Props & VariantProps<typeof dropdownMenuItemVariants>) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      className={cn(dropdownMenuItemVariants({ variant, className }))}
      {...props}
    />
  );
}

/**
 * A titled group of items. Base UI requires a `Group` around any `GroupLabel`
 * — the label is the group's accessible name, so a label with no group is a
 * name for nothing, and it throws rather than rendering one.
 */
function ContextMenuGroup(props: ContextMenuPrimitive.Group.Props) {
  return <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />;
}

function ContextMenuLabel({ className, ...props }: ContextMenuPrimitive.GroupLabel.Props) {
  return (
    <ContextMenuPrimitive.GroupLabel
      data-slot="context-menu-label"
      className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

function ContextMenuSeparator({ className, ...props }: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="context-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function ContextMenuSubmenu(props: ContextMenuPrimitive.SubmenuRoot.Props) {
  return <ContextMenuPrimitive.SubmenuRoot {...props} />;
}

function ContextMenuSubmenuTrigger({
  className,
  ...props
}: ContextMenuPrimitive.SubmenuTrigger.Props) {
  return (
    <ContextMenuPrimitive.SubmenuTrigger
      data-slot="context-menu-submenu-trigger"
      className={cn(dropdownMenuItemVariants({ className }))}
      {...props}
    />
  );
}

function ContextMenuSubmenuContent({ className, ...props }: ContextMenuPrimitive.Popup.Props) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner side="inline-end" align="start" className="outline-none">
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-submenu-content"
          className={cn(POPUP_CLASS, className)}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSubmenu,
  ContextMenuSubmenuContent,
  ContextMenuSubmenuTrigger,
  ContextMenuTrigger,
};

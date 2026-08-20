export const menuPopupClass =
  "origin-(--transform-origin) rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none transition-[transform,opacity] duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[side=none]:translate-y-px data-[align-trigger=true]:animate-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-starting-style:animate-in data-starting-style:fade-in-0 data-starting-style:zoom-in-95 data-ending-style:animate-out data-ending-style:fade-out-0 data-ending-style:zoom-out-95";

export const menuItemClass =
  "flex cursor-default items-center gap-1.5 rounded-sm px-1.5 py-1 text-sm outline-none select-none text-popover-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-muted [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export const menuLabelClass = "px-1.5 py-1 text-xs font-medium text-muted-foreground";

export const menuSeparatorClass = "pointer-events-none -mx-1 my-1 h-px bg-border";

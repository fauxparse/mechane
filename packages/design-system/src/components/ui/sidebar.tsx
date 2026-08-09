import type { ComponentProps } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import { Button } from "./button";

interface SidebarContextValue {
  open: boolean;
  setOpen(open: boolean): void;
  toggleSidebar(): void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export interface SidebarProviderProps extends ComponentProps<"div"> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  children,
  ...props
}: SidebarProviderProps) {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (openProp === undefined) setOpenState(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, openProp],
  );
  const toggleSidebar = useCallback(() => setOpen(!open), [open, setOpen]);
  const contextValue = useMemo(
    () => ({ open, setOpen, toggleSidebar }),
    [open, setOpen, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-provider"
        className={cn("flex min-h-0 min-w-0", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used inside a SidebarProvider");
  return context;
}

export interface SidebarProps extends ComponentProps<"aside"> {
  side?: "left" | "right";
  collapsible?: "offcanvas" | "icon" | "none";
}

export function Sidebar({
  side = "left",
  collapsible = "icon",
  className,
  children,
  ...props
}: SidebarProps) {
  const { open } = useSidebar();
  const state = collapsible === "none" || open ? "expanded" : "collapsed";

  return (
    <aside
      data-slot="sidebar"
      data-side={side}
      data-state={state}
      className={cn(
        "group/sidebar relative flex h-full shrink-0 flex-col border-border bg-background text-foreground transition-[width] duration-200 ease-linear",
        collapsible === "offcanvas" &&
          "w-64 data-[state=collapsed]:w-0 data-[state=collapsed]:overflow-hidden",
        collapsible === "icon" && "w-64 data-[state=collapsed]:w-16",
        collapsible === "none" && "w-64",
        side === "left" ? "border-r" : "border-l",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "flex min-h-0 w-64 flex-1 flex-col",
          collapsible === "icon" && "group-data-[state=collapsed]/sidebar:w-16",
        )}
      >
        {children}
      </div>
    </aside>
  );
}

export function SidebarInset({ className, ...props }: ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col bg-background", className)}
      {...props}
    />
  );
}

export function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex flex-col gap-2 border-b border-border p-3", className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2", className)}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn("flex flex-col gap-2 border-t border-border p-3", className)}
      {...props}
    />
  );
}

export function SidebarGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}

export function SidebarGroupLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-muted-foreground outline-none",
        "group-data-[state=collapsed]/sidebar:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

export function SidebarMenuItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

export interface SidebarMenuButtonProps extends ComponentProps<"button"> {
  isActive?: boolean;
}

export function SidebarMenuButton({
  isActive = false,
  className,
  ...props
}: SidebarMenuButtonProps) {
  return (
    <button
      data-slot="sidebar-menu-button"
      data-active={isActive ? "true" : "false"}
      className={cn(
        "flex h-8 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground",
        "group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-0",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroupContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="sidebar-group-content" className={cn("w-full text-sm", className)} {...props} />
  );
}

export function SidebarTrigger({
  className,
  "aria-label": ariaLabel,
  onClick,
  ...props
}: ComponentProps<typeof Button>) {
  const { toggleSidebar, open } = useSidebar();
  return (
    <Button
      data-slot="sidebar-trigger"
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={ariaLabel ?? (open ? "Collapse sidebar" : "Expand sidebar")}
      aria-expanded={open}
      className={className}
      onClick={(event) => {
        toggleSidebar();
        onClick?.(event);
      }}
      {...props}
    />
  );
}

export function SidebarRail({ className, children, ...props }: ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      data-slot="sidebar-rail"
      type="button"
      aria-label="Toggle sidebar"
      className={cn(
        "absolute top-3 right-0 z-30 flex size-7 translate-x-1/2 items-center justify-center rounded-md border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        "group-data-[state=expanded]/sidebar:pointer-events-none group-data-[state=expanded]/sidebar:opacity-0",
        className,
      )}
      onClick={toggleSidebar}
      {...props}
    >
      {children}
    </button>
  );
}

export function SidebarSeparator({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-separator"
      className={cn("mx-2 h-px bg-border", className)}
      {...props}
    />
  );
}

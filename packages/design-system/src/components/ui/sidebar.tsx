import type { ComponentProps, CSSProperties, PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import { Button } from "./button";

const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_ICON = "3rem";

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
  style,
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
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as CSSProperties
        }
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

export function InsideSidebar({ children }: PropsWithChildren) {
  const context = useContext(SidebarContext);
  if (!context) return null;
  return <>{children}</>;
}

export interface SidebarProps extends ComponentProps<"aside"> {
  side?: "left" | "right";
  collapsible?: "offcanvas" | "icon" | "none";
  variant?: "sidebar" | "floating" | "inset";
}

export function Sidebar({
  side = "left",
  collapsible = "icon",
  variant = "sidebar",
  className,
  children,
  ...props
}: SidebarProps) {
  const { open } = useSidebar();
  const state = collapsible === "none" || open ? "expanded" : "collapsed";

  if (collapsible === "none") {
    return (
      <aside
        data-slot="sidebar"
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </aside>
    );
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
        )}
      />

      <aside
        data-slot="sidebar-container"
        data-side={side}
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] md:flex",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className,
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex size-full flex-col bg-sidebar/50 backdrop-blur-sm group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-lg group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-border"
        >
          {children}
        </div>
      </aside>
    </div>
  );
}

export function SidebarInset({ className, ...props }: ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col", className)}
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

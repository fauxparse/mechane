import type { PropsWithChildren, ReactNode } from "react";

import { cn } from "../lib/utils";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "./ui/sidebar";

export interface SectionProps {
  className?: string;
  label: ReactNode;
  buttons?: ReactNode;
}

export function Section({ label, buttons, children, className }: PropsWithChildren<SectionProps>) {
  return (
    <SidebarGroup
      className={cn(
        "border-t border-sidebar-border px-0 py-1 first:border-t-0 [--section-columns:1fr_1fr_1.75rem]",
        className,
      )}
    >
      <SidebarGroupLabel className="h-7 justify-between gap-2 px-4">
        <span>{label}</span>
        {buttons ? <div className="flex items-center justify-end gap-1">{buttons}</div> : null}
      </SidebarGroupLabel>
      <SidebarGroupContent className="grid grid-cols-(--section-columns) gap-2 p-4 pt-1 pb-2">
        {children}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function SectionRow({ className, children }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn("col-start-1 -col-end-1 grid grid-cols-subgrid gap-2", className)}>
      {children}
    </div>
  );
}

export function SectionHelperText({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn("col-start-1 col-span-2 text-xs text-muted-foreground", className)}>
      {children}
    </div>
  );
}

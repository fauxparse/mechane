import { cn, SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@mechane/design-system";
import { PropsWithChildren, ReactNode } from "react";

type SectionProps = {
  className?: string;
  label: string;
  buttons?: ReactNode;
};

export const Section = ({
  label,
  buttons,
  children,
  className,
}: PropsWithChildren<SectionProps>) => {
  return (
    <SidebarGroup
      className={cn("px-0 py-1 border-t border-sidebar-border first:border-t-0", className)}
    >
      <SidebarGroupLabel className="justify-between gap-2 h-7 px-4">
        <span>{label}</span>
        {buttons && <div className="flex gap-1 items-center justify-end">{buttons}</div>}
      </SidebarGroupLabel>
      <SidebarGroupContent className="p-4 pt-1 pb-2 grid grid-cols-[1fr_1fr_1.75rem] gap-2">
        {children}
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export const SectionRow = ({ className, children }: PropsWithChildren<{ className?: string }>) => (
  <div className={cn("grid col-start-1 -col-end-1 grid-cols-subgrid", className)}>{children}</div>
);

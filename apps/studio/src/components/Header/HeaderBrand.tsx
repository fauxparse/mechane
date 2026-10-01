// The translucent Logo pill that opens every top bar. The editor fills it with
// the Show's menu; the dashboard, which belongs to no Show, with the wordmark.
import { cn } from "@mechane/design-system";
import type { ReactNode } from "react";

import { Logo } from "./Logo";

export interface HeaderBrandProps {
  className?: string;
  children?: ReactNode;
}

export function HeaderBrand({ className, children }: HeaderBrandProps) {
  return (
    <div
      className={cn(
        "flex w-fit items-center gap-1 rounded-full bg-muted/50 pl-1 backdrop-blur-[2px]",
        className,
      )}
    >
      <Logo className="size-6" />
      {children}
    </div>
  );
}

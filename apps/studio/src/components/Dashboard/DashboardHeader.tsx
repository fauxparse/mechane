// The dashboard's top bar (issue #604), built from the editor's parts.
//
// Not `../Header/Header` itself: that header's whole middle and right are
// Show-scoped — the Show name menu, the Show/Scenes tabs, publish, Go live —
// and none of it exists on a page that belongs to no Show. What carries over
// are the pieces that are not: the Logo pill and the account menu.
import { cn } from "@mechane/design-system";
import type { ReactNode } from "react";

import { AccountMenu } from "../Header/AccountMenu";
import type { HeaderUser } from "../Header/Header";
import { HeaderBrand } from "../Header/HeaderBrand";

export interface DashboardHeaderProps {
  user: HeaderUser;
  onLogOut(): void;
  /** Whether the account menu offers the admin area (issue #826). */
  canAdminister?: boolean;
  /** Anything the page wants left of the account menu. */
  actions?: ReactNode;
  className?: string;
}

export function DashboardHeader({
  user,
  onLogOut,
  canAdminister,
  actions,
  className,
}: DashboardHeaderProps) {
  return (
    <header className={cn("flex items-center justify-between gap-2 px-2 py-2", className)}>
      <HeaderBrand className="pl-2 pr-3">
        <span className="px-1 py-1.5 text-sm font-semibold tracking-tight">Mechanē</span>
      </HeaderBrand>

      <div className="flex items-center gap-2">
        {actions}
        <AccountMenu user={user} canAdminister={canAdminister} onLogOut={onLogOut} />
      </div>
    </header>
  );
}

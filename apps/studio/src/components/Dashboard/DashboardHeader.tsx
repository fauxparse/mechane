// The dashboard's top bar (issue #604), kept consistent with the editor's.
//
// Deliberately not `../Header/Header`: that header's whole middle and right
// are Show-scoped — the Show name menu, the Show/Scenes tabs, publish, Go
// live — and none of it exists on a page that belongs to no Show. What carries
// over is the vocabulary: the same Logo, the same translucent rounded pill
// treatment, and the same account menu with the same items in the same order.
//
// Like `../Header/Header`, it owns the theme setting itself rather than taking
// it as a prop: the mode switch belongs to the menu, not to whatever renders
// the menu.
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LogOutIcon,
  MoonIcon,
  SettingsIcon,
  ShieldIcon,
  SunIcon,
} from "@mechane/design-system";
import { DEFAULT_THEME_MODE, type ThemeMode } from "@mechane/domain/theme-settings";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useUserSettings } from "../../api/settings";
import { Logo } from "../Header/Logo";

export interface DashboardHeaderUser {
  id: string;
  name?: string | null;
  email: string;
  avatarUrl?: string | null;
}

export interface DashboardHeaderProps {
  user: DashboardHeaderUser;
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
  canAdminister = false,
  actions,
  className,
}: DashboardHeaderProps) {
  const { settings, updateSettings } = useUserSettings();
  const mode = (settings?.themeMode ?? DEFAULT_THEME_MODE) as ThemeMode;

  return (
    <header className={cn("flex items-center justify-between gap-2 px-2 py-2", className)}>
      <div className="flex w-fit items-center gap-1 rounded-full bg-muted/50 pl-2 pr-3 backdrop-blur-[2px]">
        <Logo className="size-6" />
        <span className="px-1 py-1.5 text-sm font-semibold tracking-tight">Mechanē</span>
      </div>

      <div className="flex items-center gap-2">
        {actions}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="h-auto rounded-full border-0 p-0"
                aria-label="Account"
              >
                <Avatar>
                  {user.avatarUrl ? (
                    <AvatarImage src={user.avatarUrl} alt={user.name ?? user.email} />
                  ) : null}
                  <AvatarFallback id={user.id} />
                </Avatar>
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuItem
              render={
                <Link to="/settings">
                  <SettingsIcon />
                  <span>Settings</span>
                </Link>
              }
            />
            {canAdminister ? (
              <DropdownMenuItem
                render={
                  <Link to="/admin">
                    <ShieldIcon />
                    <span>Admin</span>
                  </Link>
                }
              />
            ) : null}
            <DropdownMenuItem
              onClick={() => updateSettings({ themeMode: mode === "dark" ? "light" : "dark" })}
            >
              {mode === "dark" ? (
                <>
                  <SunIcon />
                  <span>Light mode</span>
                </>
              ) : (
                <>
                  <MoonIcon className="size-4" />
                  <span>Dark mode</span>
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={onLogOut}>
                <LogOutIcon />
                Log out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

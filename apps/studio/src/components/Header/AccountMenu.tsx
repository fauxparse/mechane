// The avatar menu at the right of every top bar — the editor's and the
// dashboard's — so the account items read the same everywhere.
//
// It owns the theme setting itself rather than taking it as a prop: the mode
// switch belongs to the menu, not to whatever renders the menu.
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
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

import { useUserSettings } from "../../api/settings";
import type { HeaderUser } from "./Header";

export interface AccountMenuProps {
  user: HeaderUser;
  /** Whether the menu offers the admin area (issue #826). */
  canAdminister?: boolean;
  onLogOut(): void;
  /** Overrides persistence when an embedding surface owns theme state. */
  onThemeModeChange?(mode: ThemeMode): void;
}

export function AccountMenu({
  user,
  canAdminister = false,
  onLogOut,
  onThemeModeChange,
}: AccountMenuProps) {
  const { settings, updateSettings } = useUserSettings();
  const mode = (settings?.themeMode ?? DEFAULT_THEME_MODE) as ThemeMode;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="h-auto rounded-full border-0 p-0" aria-label="Account">
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
          onClick={() => {
            const nextMode = mode === "dark" ? "light" : "dark";
            if (onThemeModeChange) onThemeModeChange(nextMode);
            else updateSettings({ themeMode: nextMode });
          }}
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
  );
}

import {
  Alert,
  AlertTitle,
  AlertTriangleIcon,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  CheckIcon,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  InsideSidebar,
  LogOutIcon,
  MoonIcon,
  PlayIcon,
  SettingsIcon,
  SidebarIcon,
  SidebarTrigger,
  SquareIcon,
  SunIcon,
} from "@mechane/design-system";
import { DEFAULT_THEME_MODE, type ThemeMode } from "@mechane/domain";
import type { MouseEvent } from "react";

import { useUserSettings } from "../../api/settings";
import type { HeaderProps } from "./Header";
import { navigationIntentFor } from "./header-navigation";

type HeaderRightProps = Pick<
  HeaderProps,
  | "navigation"
  | "user"
  | "onLogOut"
  | "publishState"
  | "onPublish"
  | "publishDisabledReason"
  | "publishing"
  | "runActive"
  | "onStartRun"
  | "onEndRun"
  | "runPending"
  | "onThemeModeChange"
>;

function activate(destination: HeaderRightProps["navigation"]["settings"]) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    switch (navigationIntentFor(event)) {
      case "navigate":
        event.preventDefault();
        destination.onSelect();
        return;
      case "new-tab":
        window.open(destination.href, "_blank", "noopener");
        return;
      case "ignore":
        return;
    }
  };
}

export function HeaderRight({
  navigation,
  user,
  onLogOut,
  publishState,
  onPublish,
  publishDisabledReason,
  publishing = false,
  runActive = false,
  onStartRun,
  onEndRun,
  runPending = false,
  onThemeModeChange,
}: HeaderRightProps) {
  const { settings, updateSettings } = useUserSettings();
  const mode = (settings?.themeMode ?? DEFAULT_THEME_MODE) as ThemeMode;
  const dirty = publishState === "unpublished-changes";

  return (
    <div className="editor-chrome-header-right pointer-events-auto flex w-fit items-center justify-self-end gap-2">
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
              <a href={navigation.settings.href} onClick={activate(navigation.settings)}>
                <SettingsIcon />
                Settings
              </a>
            }
          />
          <DropdownMenuItem
            onClick={() => {
              const nextMode = mode === "dark" ? "light" : "dark";
              onThemeModeChange?.(nextMode);
              if (!onThemeModeChange) updateSettings({ themeMode: nextMode });
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

      <div className="flex items-center">
        {runActive ? (
          <Button className="rounded-r-none border-0" size="sm" aria-live="polite">
            <span
              aria-hidden="true"
              className="size-2 animate-pulse rounded-full bg-primary-foreground"
            />
            Live
          </Button>
        ) : (
          <Button
            className="rounded-r-none border-0"
            size="sm"
            disabled={runPending}
            onClick={onStartRun}
          >
            <PlayIcon />
            {runPending ? "Starting…" : "Go live"}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                className="rounded-l-none border-0 border-l border-primary-foreground/20 px-2"
                size="sm"
                aria-label="Run and publish options"
              >
                <ChevronDownIcon className="text-accent-200" />
              </Button>
            }
          />
          <DropdownMenuContent>
            {publishDisabledReason ? (
              <Alert className="mb-1 rounded-sm border-0 bg-destructive/25 p-2 text-destructive-foreground ring-1 ring-destructive">
                <AlertTriangleIcon />
                <AlertTitle>{publishDisabledReason}</AlertTitle>
              </Alert>
            ) : dirty ? (
              <Alert className="mb-1 rounded-sm border-0 bg-destructive/25 p-2 text-destructive-foreground ring-1 ring-destructive">
                <AlertTriangleIcon />
                <AlertTitle>This show has unpublished changes.</AlertTitle>
              </Alert>
            ) : null}
            <DropdownMenuItem
              disabled={!dirty || publishing || Boolean(publishDisabledReason)}
              onClick={onPublish}
            >
              <CheckIcon /> {publishing ? "Publishing…" : "Publish changes"}
            </DropdownMenuItem>
            {runActive ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" disabled={runPending} onClick={onEndRun}>
                  <SquareIcon /> {runPending ? "Ending…" : "End run"}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <InsideSidebar>
        <SidebarTrigger
          render={
            <Button variant="ghost" size="icon">
              <SidebarIcon />
            </Button>
          }
        />
      </InsideSidebar>
    </div>
  );
}

// The top bar of the Editor Chrome: Show name and its menu, the Show/Scenes
// tabs, the user menu, the live-run control, and the sidebar trigger.
//
// Presentational, like the rest of this folder — the route wires the callbacks
// to navigation and to the rename/publish/run mutations, which keeps the whole
// Chrome renderable in Storybook without a router or a network.
//
// Navigation arrives as `href` + `onSelect` pairs rather than `<Link>`s. The
// href keeps cmd-click and middle-click working as real links; onSelect does
// the SPA navigation. Neither needs a router in scope, so a story can point
// them all at "#".
import { Logo } from "./Logo";
import {
  Alert,
  AlertTitle,
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
  Input,
  InsideSidebar,
  SidebarTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@mechane/design-system";
import type { PublishState } from "@mechane/domain";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  HouseIcon,
  LogOutIcon,
  PencilIcon,
  PlayIcon,
  SettingsIcon,
  SidebarIcon,
  SquareIcon,
  TvMinimalIcon,
  WorkflowIcon,
} from "lucide-react";
import { useState } from "react";
import type { FormEvent, MouseEvent } from "react";

import { navigationIntentFor } from "./header-navigation";

/** Which editor the Chrome is currently wrapped around. */
export type EditorKind = "show" | "canvas";

/**
 * A navigable destination. `href` exists so the control is a real link;
 * `onSelect` performs the client-side navigation.
 */
export interface HeaderDestination {
  href: string;
  onSelect(): void;
}

export interface HeaderNavigation {
  home: HeaderDestination;
  settings: HeaderDestination;
  showEditor: HeaderDestination;
  canvasEditor: HeaderDestination;
}

export interface HeaderUser {
  name?: string | null;
  email: string;
  avatarUrl?: string | null;
}

export interface HeaderProps {
  className?: string;
  /** The Show's name — the label on the title menu, and what rename edits. */
  name: string;
  activeEditor: EditorKind;
  navigation: HeaderNavigation;
  user: HeaderUser;
  onLogOut(): void;
  publishState: PublishState;
  onPublish(): void;
  publishing?: boolean;
  runActive?: boolean;
  onStartRun(): void;
  onEndRun(): void;
  runPending?: boolean;
  onRename(name: string): void;
  renaming?: boolean;
  renameError?: string;
}

/** Initials for the avatar fallback: from the name if there is one, else the email. */
function initialsFor({ name, email }: HeaderUser): string {
  const source = name?.trim() ? name.trim() : email;
  const words = source.split(/[\s@._-]+/u).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => word[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

/**
 * Intercepts a link activation so navigation stays client-side.
 *
 * Base UI's `Tabs.Tab` and `DropdownMenu.Item` both call `preventDefault()` when
 * they activate, so this cannot defer to the browser for anything — not the
 * plain click, and not a modified one. See ./header-navigation for why.
 */
function activate(destination: HeaderDestination) {
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

export const Header = ({
  className,
  name,
  activeEditor,
  navigation,
  user,
  onLogOut,
  publishState,
  onPublish,
  publishing = false,
  runActive = false,
  onStartRun,
  onEndRun,
  runPending = false,
  onRename,
  renaming = false,
  renameError,
}: HeaderProps) => {
  // `null` means "not renaming". Rename is inline rather than a dialog: it is a
  // one-field edit, and a modal over an editor the director is mid-thought in
  // costs more than it buys. Escape cancels, Enter commits.
  const [draftName, setDraftName] = useState<string | null>(null);
  const dirty = publishState === "unpublished-changes";

  const submitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draftName === null) return;
    onRename(draftName);
    setDraftName(null);
  };

  return (
    // `pointer-events-none` on the bar with `pointer-events-auto` on each
    // control keeps the gaps between them part of the editor underneath — the
    // Chrome floats over a full-bleed editor without stealing a strip of clicks.
    <header
      className={cn(
        "pointer-events-none grid w-full grid-cols-[1fr_auto_1fr] items-start justify-between gap-2",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {draftName === null ? (
          <div className="pointer-events-auto flex w-fit items-center gap-1 rounded-full bg-muted/50 backdrop-blur-[2px] pl-1">
            <Logo className="size-6" />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" className="max-w-xs rounded-full">
                    <span className="truncate">{name}</span>
                    <ChevronDownIcon className="text-muted-foreground" />
                  </Button>
                }
              />
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setDraftName(name)}>
                  <PencilIcon />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  render={
                    <a href={navigation.home.href} onClick={activate(navigation.home)}>
                      <HouseIcon />
                      <span>Home</span>
                    </a>
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <form className="pointer-events-auto flex items-center gap-2" onSubmit={submitRename}>
            <Input
              autoFocus
              aria-label="Show name"
              value={draftName}
              disabled={renaming}
              aria-invalid={renameError ? true : undefined}
              className="h-9 w-64 bg-background shadow-md"
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setDraftName(null);
              }}
            />
            <Button type="submit" size="sm" disabled={renaming}>
              {renaming ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraftName(null)}>
              Cancel
            </Button>
          </form>
        )}
        {renameError ? (
          <p role="alert" className="pointer-events-auto self-center text-sm text-destructive">
            {renameError}
          </p>
        ) : null}
      </div>

      <Tabs value={activeEditor}>
        <TabsList className="pointer-events-auto rounded-[100vw] bg-muted/50 backdrop-blur-sm">
          <TabsTrigger
            value="show"
            className="rounded-[100vw] border-0 px-3"
            nativeButton={false}
            render={
              <a href={navigation.showEditor.href} onClick={activate(navigation.showEditor)}>
                <WorkflowIcon />
                Show
              </a>
            }
          />
          <TabsTrigger
            value="canvas"
            className="rounded-[100vw] border-0 px-3"
            nativeButton={false}
            render={
              <a href={navigation.canvasEditor.href} onClick={activate(navigation.canvasEditor)}>
                <TvMinimalIcon />
                Scenes
              </a>
            }
          />
        </TabsList>
      </Tabs>

      <div className="pointer-events-auto flex items-center justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="h-auto rounded-full p-0 border-0"
                aria-label="Account"
              >
                <Avatar>
                  {user.avatarUrl ? (
                    <AvatarImage src={user.avatarUrl} alt={user.name ?? user.email} />
                  ) : null}
                  <AvatarFallback>{initialsFor(user)}</AvatarFallback>
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
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={onLogOut}>
                <LogOutIcon />
                Log out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/*
          A split button. The body starts a Run when none is active; once one is,
          it becomes a live indicator rather than a second way to end the Run —
          ending is destructive, so it lives in the menu behind the chevron.
        */}
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
              {dirty ? (
                <Alert className="mb-1 rounded-sm border-0 bg-destructive/25 p-2 text-destructive-foreground ring-1 ring-destructive">
                  <AlertTriangleIcon />
                  <AlertTitle>This show has unpublished changes.</AlertTitle>
                </Alert>
              ) : null}
              <DropdownMenuItem disabled={!dirty || publishing} onClick={onPublish}>
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
    </header>
  );
};

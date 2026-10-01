import {
  Alert,
  AlertTitle,
  AlertTriangleIcon,
  Button,
  CheckIcon,
  ChevronDownIcon,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  InsideSidebar,
  PlayIcon,
  SidebarIcon,
  SidebarTrigger,
  SquareIcon,
} from "@mechane/design-system";

import { AccountMenu } from "./AccountMenu";
import type { HeaderProps } from "./Header";

type HeaderRightProps = Pick<
  HeaderProps,
  | "user"
  | "onLogOut"
  | "autoPublish"
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

export function HeaderRight({
  user,
  onLogOut,
  autoPublish,
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
  const dirty = publishState === "unpublished-changes";
  // An auto-publishing Show has nothing to publish, so the menu only exists
  // to end a Run.
  const runMenu = !autoPublish || runActive;

  return (
    <div className="editor-chrome-header-right pointer-events-auto flex w-fit items-center justify-self-end gap-2">
      <AccountMenu user={user} onLogOut={onLogOut} onThemeModeChange={onThemeModeChange} />

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
            className={cn("border-0", runMenu && "rounded-r-none")}
            size="sm"
            disabled={runPending || (dirty && Boolean(publishDisabledReason))}
            onClick={onStartRun}
          >
            <PlayIcon />
            {runPending ? "Starting…" : "Go live"}
          </Button>
        )}
        {runMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  className="rounded-l-none border-0 border-l border-primary-foreground/20 px-2"
                  size="sm"
                  aria-label={autoPublish ? "Run options" : "Run and publish options"}
                >
                  <ChevronDownIcon className="text-accent-200" />
                </Button>
              }
            />
            <DropdownMenuContent>
              {autoPublish ? null : (
                <>
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
                  {runActive ? <DropdownMenuSeparator /> : null}
                </>
              )}
              {runActive ? (
                <DropdownMenuItem variant="destructive" disabled={runPending} onClick={onEndRun}>
                  <SquareIcon /> {runPending ? "Ending…" : "End run"}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
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

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  HouseIcon,
  Input,
  PencilIcon,
  ShapesIcon,
} from "@mechane/design-system";
import { useState, type FormEvent, type MouseEvent } from "react";

import { Logo } from "./Logo";
import type { HeaderDestination, HeaderProps } from "./Header";
import { navigationIntentFor } from "./header-navigation";

type HeaderLeftProps = Pick<
  HeaderProps,
  "name" | "navigation" | "onRename" | "renaming" | "renameError"
>;

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

export function HeaderLeft({
  name,
  navigation,
  onRename,
  renaming = false,
  renameError,
}: HeaderLeftProps) {
  const [draftName, setDraftName] = useState<string | null>(null);
  const submitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draftName === null) return;
    onRename(draftName);
    setDraftName(null);
  };

  return (
    <div className="editor-chrome-header-left flex w-fit items-start justify-self-start gap-2">
      {draftName === null ? (
        <div className="pointer-events-auto flex w-fit items-center gap-1 rounded-full bg-muted/50 backdrop-blur-[2px]">
          <Logo className="size-6" />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" className="max-w-xs rounded-full">
                  <span className="truncate">{name}</span>
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
                  <a href={navigation.shapes.href} onClick={activate(navigation.shapes)}>
                    <ShapesIcon />
                    <span>Shapes</span>
                  </a>
                }
              />
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
  );
}

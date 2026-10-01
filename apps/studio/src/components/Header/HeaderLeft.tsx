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
  SettingsIcon,
  ShapesIcon,
} from "@mechane/design-system";
import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import type { HeaderProps } from "./Header";
import { HeaderBrand } from "./HeaderBrand";

type HeaderLeftProps = Pick<
  HeaderProps,
  "name" | "showId" | "onRename" | "renaming" | "renameError"
>;

export function HeaderLeft({
  name,
  showId,
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
        <HeaderBrand className="pointer-events-auto">
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
                  <Link to="/shows/$showId/shapes" params={{ showId }}>
                    <ShapesIcon />
                    <span>Shapes</span>
                  </Link>
                }
              />
              <DropdownMenuItem
                render={
                  <Link to="/shows/$showId/settings" params={{ showId }}>
                    <SettingsIcon />
                    <span>Settings</span>
                  </Link>
                }
              />
              <DropdownMenuItem
                render={
                  <Link to="/">
                    <HouseIcon />
                    <span>Home</span>
                  </Link>
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </HeaderBrand>
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

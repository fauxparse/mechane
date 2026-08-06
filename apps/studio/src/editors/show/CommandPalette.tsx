// The Command-K palette (issue #42, per #37).
//
// #37 makes this the universal keyboard surface: every command is reachable
// here, which discharges PRD §6.3's "near-total keyboard operability"
// structurally rather than as a per-command audit. So the palette is not a
// convenience — it is the reason rare commands need no keybinding at all.
//
// The content rules (grouping, verb-first labels, disabled-with-a-reason) live
// in ./palette-commands, which is pure and tested. This file is the surface:
// a dialog, a filter field, and a list you can drive with the arrow keys.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  cn,
} from "@mechane/design-system";
import { clamp } from "es-toolkit";
import { useMemo, useState } from "react";

import { enabledCommands, groupCommands } from "./palette-commands";
import type { PaletteCommand } from "./palette-commands";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  commands: PaletteCommand[];
}

export function CommandPalette(props: CommandPaletteProps) {
  // Opening starts fresh: a palette that remembers last time's query is a
  // palette you have to clear before you can use it.
  return <CommandPaletteDialog key={props.open ? "open" : "closed"} {...props} />;
}

function CommandPaletteDialog({ open, onOpenChange, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const groups = useMemo(() => groupCommands(commands, query), [commands, query]);
  const runnable = useMemo(() => enabledCommands(commands, query), [commands, query]);
  // Narrowing the list can leave the highlight past its end. Derive the
  // visible selection instead of correcting state in an effect.
  const maxIndex = Math.max(runnable.length - 1, 0);
  const selectedIndex = clamp(highlighted, 0, maxIndex);

  const run = (command: PaletteCommand) => {
    if (command.disabledReason) return;
    onOpenChange(false);
    command.run();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-24 w-[min(34rem,calc(100vw-2rem))] translate-y-0 gap-3 p-0"
        aria-label="Command palette"
      >
        <div className="border-b border-border p-2">
          <DialogTitle className="sr-only">Commands</DialogTitle>
          <DialogDescription className="sr-only">
            Search for a command. Arrow keys to move, Enter to run.
          </DialogDescription>
          <Input
            autoFocus
            value={query}
            placeholder="Search commands…"
            aria-label="Search commands"
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            className="border-0 shadow-none focus-visible:ring-0"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlighted((current) => clamp(current + 1, 0, maxIndex));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlighted((current) => clamp(current - 1, 0, maxIndex));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const command = runnable[selectedIndex];
                if (command) run(command);
              }
            }}
          />
        </div>

        <div
          id="command-palette-list"
          role="listbox"
          className="max-h-80 overflow-y-auto px-1 pb-2"
        >
          {groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No commands match.
            </p>
          ) : null}

          {groups.map((group) => (
            <div key={group.scope} className="py-1">
              <p className="px-3 py-1 text-xs font-medium text-muted-foreground">{group.label}</p>
              {group.commands.map((command) => {
                const index = runnable.indexOf(command);
                const active = index !== -1 && index === selectedIndex;
                const Icon = command.icon;
                return (
                  <button
                    key={command.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    // Shown rather than hidden when inapplicable (#37): the
                    // palette is the only place some commands can be found.
                    disabled={Boolean(command.disabledReason)}
                    title={command.disabledReason}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm",
                      active && "bg-muted",
                      command.disabledReason ? "cursor-default opacity-50" : "hover:bg-muted",
                    )}
                    onMouseMove={() => index !== -1 && setHighlighted(index)}
                    onClick={() => run(command)}
                  >
                    {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
                    <span className="min-w-0 flex-1 truncate">{command.label}</span>
                    {command.disabledReason ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {command.disabledReason}
                      </span>
                    ) : command.shortcut ? (
                      <kbd className="shrink-0 rounded border border-border px-1 text-xs text-muted-foreground">
                        {command.shortcut}
                      </kbd>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

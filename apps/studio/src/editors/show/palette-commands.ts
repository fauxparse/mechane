// What the command palette offers, and how a query narrows it (issue #42,
// presentation decided by #37).
//
// Pure data and one matcher, so the palette's *content* is testable without
// rendering it — the rules #37 settled are all about content:
//
//   - **Grouped by scope**, reusing the same field that gates whether a
//     binding fires (`global` / `canvas` / `selection`). A command declares its
//     scope once and that decides both.
//   - **Labelled verb-first** ("Create Scene", "Zoom to selection"), because
//     fuzzy-matching is how a palette is driven: typing "cre" should surface
//     every creation command together.
//   - **Inapplicable commands are shown disabled, with a reason** rather than
//     hidden. The palette is the *only* discovery surface for commands with no
//     keybinding, so hiding them means a director who hasn't selected anything
//     can't find out that extraction exists.

import type { CommandScope } from "@mechane/commands";
import type { LucideIcon } from "lucide-react";

/** One row in the palette. */
export interface PaletteCommand {
  id: string;
  /** Verb-first (#37). */
  label: string;
  scope: CommandScope;
  icon?: LucideIcon;
  /** The keybinding, if this command has one — rendered as a hint. */
  shortcut?: string;
  /** Why it can't run right now. Present means shown, disabled, with this text. */
  disabledReason?: string;
  run(): void;
}

/** The order groups appear in: everything, then the canvas, then the selection. */
export const SCOPE_ORDER: CommandScope[] = ["global", "canvas", "selection"];

export const SCOPE_LABELS: Record<CommandScope, string> = {
  global: "Show",
  canvas: "Canvas",
  selection: "Selection",
};

/**
 * Whether `query` matches `label`, by subsequence rather than substring: "zsel"
 * finds "Zoom to selection". That's what makes a palette worth typing into
 * instead of scrolling.
 */
export function matchesQuery(label: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  const haystack = label.toLowerCase();
  let at = 0;
  for (const character of needle) {
    if (character === " ") continue;
    const found = haystack.indexOf(character, at);
    if (found === -1) return false;
    at = found + 1;
  }
  return true;
}

/** The commands `query` matches, grouped by scope in `SCOPE_ORDER`. */
export function groupCommands(
  commands: PaletteCommand[],
  query: string,
): { scope: CommandScope; label: string; commands: PaletteCommand[] }[] {
  const matched = commands.filter((command) => matchesQuery(command.label, query));
  return SCOPE_ORDER.map((scope) => ({
    scope,
    label: SCOPE_LABELS[scope],
    commands: matched.filter((command) => command.scope === scope),
  })).filter((group) => group.commands.length > 0);
}

/** Every enabled command, in the order shown — what the arrow keys walk. */
export function enabledCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  return groupCommands(commands, query)
    .flatMap((group) => group.commands)
    .filter((command) => !command.disabledReason);
}

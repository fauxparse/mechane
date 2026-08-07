import { describe, expect, it } from "vitest";

import { enabledCommands, groupCommands, matchesQuery } from "./palette-commands";
import type { PaletteCommand } from "./palette-commands";

function command(
  overrides: Partial<PaletteCommand> & Pick<PaletteCommand, "id" | "label">,
): PaletteCommand {
  return { scope: "canvas", run: () => {}, ...overrides };
}

const COMMANDS: PaletteCommand[] = [
  command({ id: "undo", label: "Undo", scope: "global" }),
  command({ id: "redo", label: "Redo", scope: "global", disabledReason: "nothing to redo" }),
  command({ id: "create-scene", label: "Create Scene" }),
  command({ id: "create-flow", label: "Create Flow" }),
  command({ id: "zoom", label: "Zoom to selection", disabledReason: "select a node first" }),
  command({ id: "delete", label: "Delete selection", scope: "selection" }),
];

describe("matchesQuery", () => {
  it("matches everything on an empty query", () => {
    expect(matchesQuery("Create Scene", "")).toBe(true);
    expect(matchesQuery("Create Scene", "   ")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(matchesQuery("Create Scene", "CREATE")).toBe(true);
  });

  // Fuzzy-matching is how a palette is actually driven (#37).
  it("matches a subsequence, not just a substring", () => {
    expect(matchesQuery("Zoom to selection", "zsel")).toBe(true);
    expect(matchesQuery("Delete selection", "dsel")).toBe(true);
    expect(matchesQuery("Create Scene", "ctsn")).toBe(true);
  });

  it("ignores spaces in the query", () => {
    expect(matchesQuery("Zoom to selection", "zoom sel")).toBe(true);
  });

  it("rejects characters that aren't there in order", () => {
    expect(matchesQuery("Create Scene", "flow")).toBe(false);
    expect(matchesQuery("Create Scene", "enecs")).toBe(false);
  });
});

describe("groupCommands", () => {
  // #37: the same scope field that gates whether a binding fires also groups
  // the palette, so there's one taxonomy rather than two.
  it("groups by scope in a fixed order, dropping empty groups", () => {
    expect(groupCommands(COMMANDS, "").map((group) => group.scope)).toEqual([
      "global",
      "canvas",
      "selection",
    ]);
    expect(groupCommands(COMMANDS, "create").map((group) => group.scope)).toEqual(["canvas"]);
  });

  it("labels each group for a person", () => {
    expect(groupCommands(COMMANDS, "").map((group) => group.label)).toEqual([
      "Show",
      "Canvas",
      "Selection",
    ]);
  });

  // Verb-first labels mean "cre" surfaces every creation command at once (#37).
  it("surfaces the creation commands together", () => {
    const matched = groupCommands(COMMANDS, "cre").flatMap((group) => group.commands);
    expect(matched.map((c) => c.id)).toEqual(["create-scene", "create-flow"]);
  });

  // Shown disabled, not hidden: the palette is the only discovery surface for
  // commands with no keybinding (#37).
  it("keeps inapplicable commands in the list", () => {
    const matched = groupCommands(COMMANDS, "zoom").flatMap((group) => group.commands);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.disabledReason).toBe("select a node first");
  });

  it("has nothing to show when nothing matches", () => {
    expect(groupCommands(COMMANDS, "xyzzy")).toEqual([]);
  });
});

describe("enabledCommands", () => {
  // What the arrow keys walk: the shown order, minus what can't run.
  it("lists the runnable commands in display order", () => {
    expect(enabledCommands(COMMANDS, "").map((command) => command.id)).toEqual([
      "undo",
      "create-scene",
      "create-flow",
      "delete",
    ]);
  });

  it("is empty when every match is disabled", () => {
    expect(enabledCommands(COMMANDS, "zoom")).toEqual([]);
  });
});

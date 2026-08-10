import { describe, expect, it } from "vitest";

import { navigationIntentFor } from "./header-navigation";
import type { Activation } from "./header-navigation";

const click = (overrides: Partial<Activation> = {}): Activation => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...overrides,
});

describe("navigationIntentFor", () => {
  it("navigates in place on a plain left click", () => {
    expect(navigationIntentFor(click())).toBe("navigate");
  });

  // The regression this module was extracted for: Base UI's Tabs.Tab and
  // DropdownMenu.Item preventDefault on activation, so a plain click must be
  // handled here or the Header's tabs and menu links do nothing at all.
  it("navigates regardless of the event already being default-prevented", () => {
    // `defaultPrevented` is deliberately not part of Activation — consulting it
    // is what broke every Header destination.
    expect(Object.keys(click())).not.toContain("defaultPrevented");
  });

  it.each([
    ["cmd", { metaKey: true }],
    ["ctrl", { ctrlKey: true }],
    ["shift", { shiftKey: true }],
  ])("opens a new tab on %s-click, since the browser will not", (_name, modifier) => {
    expect(navigationIntentFor(click(modifier))).toBe("new-tab");
  });

  it("leaves alt-click to the browser, where it means download", () => {
    expect(navigationIntentFor(click({ altKey: true }))).toBe("ignore");
  });

  it.each([
    ["middle", 1],
    ["right", 2],
  ])("leaves a %s click alone", (_name, button) => {
    expect(navigationIntentFor(click({ button }))).toBe("ignore");
  });

  it("prefers new-tab over navigate when a modifier is held on button 0", () => {
    expect(navigationIntentFor(click({ button: 0, metaKey: true }))).toBe("new-tab");
  });

  it("ignores a modified non-primary click rather than opening a tab twice", () => {
    expect(navigationIntentFor(click({ button: 1, metaKey: true }))).toBe("ignore");
  });
});

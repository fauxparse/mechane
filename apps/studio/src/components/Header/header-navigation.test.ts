import type { MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { followHeaderLink, navigationIntentFor } from "./header-navigation";
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

  it.each([
    ["cmd", { metaKey: true }],
    ["ctrl", { ctrlKey: true }],
    ["shift", { shiftKey: true }],
  ])("opens a new tab on %s-click", (_name, modifier) => {
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

describe("followHeaderLink", () => {
  // Base UI leaves the anchor's default alone. If the handler does too, the
  // browser reloads the whole page after the client-side navigation, and a live
  // Run asks the director to confirm leaving the Show they are still in.
  it("navigates client-side on a plain click and stops the browser following the href", () => {
    const onSelect = vi.fn();
    const preventDefault = vi.fn();
    const event = { ...click(), preventDefault } as unknown as MouseEvent<HTMLAnchorElement>;

    followHeaderLink({ href: "/shows/s1/art", onSelect })(event);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it } from "vitest";

import { keypressObservationFor } from "./player-keypress";

function keydown(overrides: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    repeat: false,
    isComposing: false,
    keyCode: 0,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    getModifierState: () => false,
    ...overrides,
  } as KeyboardEvent;
}

describe("keypressObservationFor", () => {
  const free = () => false;
  const claimed = () => true;

  it("returns the stored key for a bindable press", () => {
    expect(keypressObservationFor(keydown({ key: "R" }), free)).toBe("r");
  });

  it("stands down while a text control has the keyboard", () => {
    expect(keypressObservationFor(keydown({ key: "r" }), claimed)).toBeNull();
  });

  it("still fires when a button has focus", () => {
    // The Player's suppression rule is the opposite of the Studio's: a tech
    // who clicked "Use this tab instead" must not lose every shortcut. Only
    // text-entry controls claim the keyboard here.
    expect(keypressObservationFor(keydown({ key: "r" }), free)).toBe("r");
  });

  it("drops repeats, so a leaned-on key navigates once", () => {
    expect(keypressObservationFor(keydown({ key: "r", repeat: true }), free)).toBeNull();
  });

  it("drops IME input, including the first keydown of a composition", () => {
    expect(keypressObservationFor(keydown({ key: "a", isComposing: true }), free)).toBeNull();
    expect(keypressObservationFor(keydown({ key: "a", keyCode: 229 }), free)).toBeNull();
  });
});

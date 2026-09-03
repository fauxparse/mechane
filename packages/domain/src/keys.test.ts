import { describe, expect, it } from "vitest";

import {
  bindableKeyFor,
  isBindableKey,
  keyAccessibleName,
  keyDisplayName,
  normalizeKey,
  type KeypressCandidate,
} from "./keys";

function keydown(overrides: Partial<KeypressCandidate> & { key: string }): KeypressCandidate {
  return {
    repeat: false,
    isComposing: false,
    keyCode: 0,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    getModifierState: () => false,
    ...overrides,
  };
}

describe("isBindableKey", () => {
  it("accepts any single printable character, not only Latin ones", () => {
    // UI Events reports the same physical key as "v" on a US layout and "ر" on
    // an Arabic one, so an enumerated ASCII set would exclude those authors.
    for (const key of ["a", "Z", "7", "?", "@", "ر", "é", "字"]) {
      expect(isBindableKey(key)).toBe(true);
    }
  });

  it("accepts the named keys", () => {
    for (const key of ["Space", "Tab", "Enter", "ArrowLeft", "ArrowDown"]) {
      expect(isBindableKey(key)).toBe(true);
    }
  });

  it("refuses keys whose browser default a Player cannot suppress", () => {
    for (const key of ["F5", "F11", "Backspace", "Delete", "Home", "PageUp"]) {
      expect(isBindableKey(key)).toBe(false);
    }
  });

  it("refuses control characters, the empty string, and a raw space", () => {
    expect(isBindableKey("")).toBe(false);
    expect(isBindableKey("\t")).toBe(false);
    // A raw U+0020 is stored under the name "Space"; admitting both forms
    // would let hand-edited data hold a key no capture path can produce.
    expect(isBindableKey(" ")).toBe(false);
  });
});

describe("normalizeKey", () => {
  it("casefolds single characters, because Shift and CapsLock both flip case", () => {
    expect(normalizeKey("R")).toBe("r");
    expect(normalizeKey("r")).toBe("r");
  });

  it("leaves named keys in their spec casing", () => {
    expect(normalizeKey("ArrowLeft")).toBe("ArrowLeft");
    expect(normalizeKey("Tab")).toBe("Tab");
  });
});

describe("bindableKeyFor", () => {
  it("stores the casefolded character", () => {
    expect(bindableKeyFor(keydown({ key: "R" }))).toBe("r");
  });

  it("stores a raw space under its name, where a trim cannot destroy it", () => {
    expect(bindableKeyFor(keydown({ key: " " }))).toBe("Space");
  });

  it("permits Shift, so shift-reachable specials stay bindable", () => {
    // Shift is a *glyph* modifier: the browser has already applied it, and the
    // event arrives as the shifted glyph.
    expect(bindableKeyFor(keydown({ key: "?" }))).toBe("?");
    expect(bindableKeyFor(keydown({ key: "@" }))).toBe("@");
  });

  it("refuses Ctrl, Meta, Alt, and AltGraph", () => {
    expect(bindableKeyFor(keydown({ key: "r", ctrlKey: true }))).toBeNull();
    expect(bindableKeyFor(keydown({ key: "r", metaKey: true }))).toBeNull();
    // macOS Option is AltGr: Option+G arrives as "©", a glyph the author
    // cannot predict or re-find.
    expect(bindableKeyFor(keydown({ key: "©", altKey: true }))).toBeNull();
    expect(
      bindableKeyFor(keydown({ key: "e", getModifierState: (m) => m === "AltGraph" })),
    ).toBeNull();
  });

  it("refuses a modifier pressed on its own, so capture can sit through Shift", () => {
    for (const key of ["Shift", "Control", "Alt", "Meta", "CapsLock"]) {
      expect(bindableKeyFor(keydown({ key }))).toBeNull();
    }
  });

  it("refuses repeats, so a leaned-on key does not queue navigations", () => {
    expect(bindableKeyFor(keydown({ key: "r", repeat: true }))).toBeNull();
  });

  it("refuses IME input by both signals", () => {
    expect(bindableKeyFor(keydown({ key: "a", isComposing: true }))).toBeNull();
    // keyCode 229 is not redundant: the first keydown of a composition
    // sequence carries isComposing: false while already IME-processed.
    expect(bindableKeyFor(keydown({ key: "a", keyCode: 229 }))).toBeNull();
  });

  it("refuses values that identify no key", () => {
    // "Process" is Firefox's IME sentinel; "Dead" is a dead key mid-sequence.
    for (const key of ["Dead", "Process", "Unidentified", "Escape"]) {
      expect(bindableKeyFor(keydown({ key }))).toBeNull();
    }
  });
});

describe("key names", () => {
  it("shows a glyph but speaks words for the arrows", () => {
    expect(keyDisplayName("ArrowLeft")).toBe("←");
    expect(keyAccessibleName("ArrowLeft")).toBe("Left arrow");
  });

  it("uppercases letters, as printed on the keycap", () => {
    expect(keyDisplayName("r")).toBe("R");
    expect(keyAccessibleName("r")).toBe("R");
  });

  it("does not platform-split Enter", () => {
    // One Show is authored once and may be run by a tech on the other
    // platform; a label that changes identity by viewer is worse.
    expect(keyDisplayName("Enter")).toBe("Enter");
  });
});

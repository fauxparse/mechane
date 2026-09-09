import { describe, expect, it } from "vitest";

import { CODE_ALPHABET, PAIRING_CODE_PATTERN } from "./pairing-code";

describe("Device pairing code format", () => {
  it("accepts every character from the canonical alphabet", () => {
    for (const character of CODE_ALPHABET) {
      expect(PAIRING_CODE_PATTERN.test(character.repeat(5))).toBe(true);
    }
  });

  it("rejects ambiguous characters", () => {
    for (const character of "0ILO") {
      expect(PAIRING_CODE_PATTERN.test(character.repeat(5))).toBe(false);
    }
  });
});

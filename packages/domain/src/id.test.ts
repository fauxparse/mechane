import { describe, expect, it } from "vitest";

import { assertValidId, generateId, ID_PREFIXES, InvalidIdError, isId } from "./id";

describe("generateId", () => {
  it("produces an 8-character id", () => {
    expect(generateId("show")).toHaveLength(8);
  });

  it("prefixes the id with the entity's letter", () => {
    expect(generateId("show").startsWith(ID_PREFIXES.show)).toBe(true);
    expect(generateId("scene").startsWith(ID_PREFIXES.scene)).toBe(true);
    expect(generateId("block").startsWith(ID_PREFIXES.block)).toBe(true);
  });

  it("never uses an ambiguous character", () => {
    const ids = Array.from({ length: 500 }, () => generateId("show"));
    expect(ids.join("").slice(1)).not.toMatch(/[01ilou]/);
  });

  it("doesn't repeat itself", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId("show")));
    expect(ids.size).toBe(1000);
  });

  it("uses the whole alphabet rather than a biased slice of it", () => {
    // Guards the rejection sampling in `randomChars`: a plain `% length`
    // would still pass every test above while over-picking early
    // characters. 1000 ids is 7000 characters over a 30-character
    // alphabet — every character should show up.
    const chars = new Set(
      Array.from({ length: 1000 }, () => generateId("show"))
        .map((id) => id.slice(1))
        .join(""),
    );
    expect(chars.size).toBe(30);
  });
});

describe("isId", () => {
  it("accepts a generated id", () => {
    expect(isId("show", generateId("show"))).toBe(true);
  });

  it("rejects an id belonging to another entity", () => {
    expect(isId("show", generateId("scene"))).toBe(false);
  });

  it("rejects a UUID", () => {
    expect(isId("show", "f81d4fae-7dec-11d0-a765-00a0c91e6bf6")).toBe(false);
  });

  it("rejects an id that's too short or too long", () => {
    expect(isId("show", "sk3f9q")).toBe(false);
    expect(isId("show", "sk3f9qaaa")).toBe(false);
  });

  it("rejects an id containing an ambiguous character", () => {
    expect(isId("show", "s0k3f9q")).toBe(false);
    expect(isId("show", "slk3f9q")).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(isId("show", "")).toBe(false);
  });
});

describe("assertValidId", () => {
  it("returns the id when it's valid", () => {
    const id = generateId("show");
    expect(assertValidId("show", id)).toBe(id);
  });

  it("throws for a malformed id", () => {
    expect(() => assertValidId("show", "nope")).toThrow(InvalidIdError);
  });

  it("names the entity in the error message", () => {
    expect(() => assertValidId("scene", "nope")).toThrow(/Invalid scene id/);
  });
});

describe("ID_PREFIXES", () => {
  it("gives every entity a distinct single character", () => {
    const prefixes = Object.values(ID_PREFIXES);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const prefix of prefixes) {
      expect(prefix).toHaveLength(1);
    }
  });
});

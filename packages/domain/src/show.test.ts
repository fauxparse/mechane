import { describe, expect, it } from "vitest";

import { assertValidShowName, InvalidShowNameError } from "./show";

describe("assertValidShowName", () => {
  it("returns the name unchanged when it's already valid", () => {
    expect(assertValidShowName("Macbeth")).toBe("Macbeth");
  });

  it("trims leading/trailing whitespace", () => {
    expect(assertValidShowName("  Macbeth  ")).toBe("Macbeth");
  });

  it("throws for an empty name", () => {
    expect(() => assertValidShowName("")).toThrow(InvalidShowNameError);
  });

  it("throws for a name that is only whitespace", () => {
    expect(() => assertValidShowName("   ")).toThrow(InvalidShowNameError);
  });

  it("throws for a name over the length limit", () => {
    expect(() => assertValidShowName("x".repeat(201))).toThrow(InvalidShowNameError);
  });

  it("allows a name exactly at the length limit", () => {
    const name = "x".repeat(200);
    expect(assertValidShowName(name)).toBe(name);
  });
});

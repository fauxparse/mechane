import { describe, expect, it } from "vitest";

import { assertOwnedBy, isOwnedBy, NotOwnerError } from "./ownership";

describe("isOwnedBy", () => {
  it("is true when the resource's userId matches", () => {
    expect(isOwnedBy({ userId: "user-1" }, "user-1")).toBe(true);
  });

  it("is false when the resource's userId does not match", () => {
    expect(isOwnedBy({ userId: "user-1" }, "user-2")).toBe(false);
  });
});

describe("assertOwnedBy", () => {
  it("returns the resource unchanged when the user owns it", () => {
    const show = { id: "show-1", userId: "user-1" };
    expect(assertOwnedBy(show, "user-1")).toBe(show);
  });

  it("throws NotOwnerError when the user does not own it", () => {
    const show = { id: "show-1", userId: "user-1" };
    expect(() => assertOwnedBy(show, "user-2")).toThrow(NotOwnerError);
  });

  it("throws for a different user even with the same resource id", () => {
    const showA = { id: "show-1", userId: "user-1" };
    const showB = { id: "show-1", userId: "user-2" };
    expect(isOwnedBy(showA, "user-1")).toBe(true);
    expect(isOwnedBy(showB, "user-1")).toBe(false);
  });
});

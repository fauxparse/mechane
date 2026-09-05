import { describe, expect, it } from "vitest";

import type { Shape, Type } from "./shapes";
import {
  applyWiringConversion,
  convertedSourceType,
  isWiringConversion,
  requiredWiringConversion,
  wiringTypesCompatible,
} from "./wiring-conversion";

const candidate: Shape = {
  id: "shape_candidate",
  name: "Candidate",
  fields: [
    { id: "field_name", name: "name", type: "text", required: true, defaultValue: "" },
    { id: "field_votes", name: "votes", type: "number", required: true, defaultValue: 0 },
  ],
};

const shapes = [candidate];
const candidateType: Type = { kind: "shape", shapeId: candidate.id };
const candidates: Type = { kind: "array", of: candidateType };

describe("requiredWiringConversion", () => {
  it("selects the first item to feed a single target from an array producer", () => {
    expect(requiredWiringConversion(candidates, candidateType, shapes)).toBe("firstItem");
    expect(requiredWiringConversion({ kind: "array", of: "text" }, "text")).toBe("firstItem");
  });

  it("applies the element-to-target coercion table to the item it selects", () => {
    expect(requiredWiringConversion({ kind: "array", of: "number" }, "text")).toBe("firstItem");
    expect(requiredWiringConversion({ kind: "array", of: "text" }, "image")).toBeNull();
  });

  it("asks for no conversion where the types already fit", () => {
    expect(requiredWiringConversion("number", "text")).toBeNull();
    expect(requiredWiringConversion("text", { kind: "array", of: "text" })).toBeNull();
    expect(
      requiredWiringConversion({ kind: "array", of: "text" }, { kind: "array", of: "text" }),
    ).toBeNull();
  });

  it("leaves an array target alone: it has no 'which item?' to answer", () => {
    expect(
      requiredWiringConversion({ kind: "array", of: candidates }, { kind: "array", of: "text" }),
    ).toBeNull();
  });
});

describe("wiringTypesCompatible", () => {
  it("compares the selected element with the target, not the array", () => {
    expect(wiringTypesCompatible(candidates, candidateType, "firstItem", shapes)).toBe(true);
    expect(wiringTypesCompatible(candidates, candidateType, null, shapes)).toBe(false);
  });

  it("refuses a declared conversion that does not apply", () => {
    expect(wiringTypesCompatible("text", "text", "firstItem")).toBe(false);
    expect(
      wiringTypesCompatible(
        { kind: "array", of: "text" },
        { kind: "array", of: "text" },
        "firstItem",
      ),
    ).toBe(false);
    expect(wiringTypesCompatible({ kind: "array", of: "text" }, "image", "firstItem")).toBe(false);
  });
});

describe("convertedSourceType", () => {
  it("reads the element type out of the array a conversion selects from", () => {
    expect(convertedSourceType(candidates, "firstItem")).toEqual(candidateType);
    expect(convertedSourceType(candidates, null)).toEqual(candidates);
    expect(convertedSourceType("text", "firstItem")).toBeNull();
  });
});

describe("applyWiringConversion", () => {
  it("takes position zero, not a match on anything else", () => {
    expect(applyWiringConversion(["first", "second"], "firstItem")).toEqual({
      ok: true,
      value: "first",
    });
  });

  it("is positional: reordering the producer changes what it carries", () => {
    const items = ["first", "second"];
    expect(applyWiringConversion([...items].reverse(), "firstItem")).toEqual({
      ok: true,
      value: "second",
    });
  });

  it("unwraps the collection envelope so a Shape target receives a Shape", () => {
    const value = { field_name: "Alice", field_votes: 3 };
    expect(applyWiringConversion([value], "firstItem")).toEqual({
      ok: true,
      value,
    });
  });

  it("reports absence rather than substituting a fallback item", () => {
    expect(applyWiringConversion([], "firstItem")).toEqual({ ok: false, failure: "empty" });
    expect(applyWiringConversion("text", "firstItem")).toEqual({
      ok: false,
      failure: "notAnArray",
    });
  });
});

describe("isWiringConversion", () => {
  it("names only the conversions the graph can perform", () => {
    expect(isWiringConversion("firstItem")).toBe(true);
    expect(isWiringConversion("lastItem")).toBe(false);
  });
});

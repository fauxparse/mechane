import { describe, expect, it } from "vitest";

import type { SceneVariable } from "@mechane/domain/graph";
import type { Shape } from "@mechane/domain/shapes";
import {
  sizeConstraintKey,
  sizeValueNumber,
  sizeValueUnit,
  sizingForMode,
  textValueForPreview,
  variableInput,
  variableOptions,
} from "./canvas-inspector-values";

describe("canvas inspector values", () => {
  it("uses the current rendered dimension when changing hug to fixed", () => {
    expect(sizingForMode({ mode: "hug" }, "fixed", 248)).toEqual({ mode: "fixed", value: 248 });
  });

  it("drops a Formula when switching to Fill, and keeps it when re-choosing fixed", () => {
    const formula = {
      mode: "fixed" as const,
      value: { kind: "formula" as const, formula: "Total * 2", fallback: 40 },
    };
    expect(sizingForMode(formula, "fill", 120)).toEqual({ mode: "fill" });
    expect(sizingForMode(formula, "fixed", 120)).toBe(formula);
  });

  it("maps each axis and constraint to its sizing key", () => {
    expect(sizeConstraintKey("width", "min")).toBe("minWidth");
    expect(sizeConstraintKey("height", "max")).toBe("maxHeight");
  });

  it("unwraps constraint values in both plain and united forms", () => {
    expect(sizeValueNumber(120)).toBe(120);
    expect(sizeValueNumber({ value: 50, unit: "%" })).toBe(50);
    expect(sizeValueNumber(undefined)).toBeNull();
    expect(sizeValueUnit({ value: 50, unit: "%" })).toBe("%");
    expect(sizeValueUnit(120)).toBe("px");
  });
  it("resolves nested Shape field bindings into compatible editor variables", () => {
    const details: Shape = {
      id: "shape_details",
      name: "Details",
      fields: [{ id: "field_city", name: "City", type: "text", required: true, defaultValue: "" }],
    };
    const candidate: Shape = {
      id: "shape_candidate",
      name: "Candidate",
      fields: [
        {
          id: "field_details",
          name: "Details",
          type: { kind: "shape", shapeId: details.id },
          required: true,
          defaultValue: {},
        },
        { id: "field_votes", name: "Votes", type: "number", required: true, defaultValue: 0 },
        { id: "field_image", name: "Image", type: "image", required: false, defaultValue: null },
      ],
    };
    const variables: SceneVariable[] = [
      { id: "candidate", name: "Candidate", type: { kind: "shape", shapeId: candidate.id } },
    ];
    const shapes = [candidate, details];

    expect(
      variableInput(
        { kind: "variable", variableId: "candidate", fieldPath: ["field_details", "field_city"] },
        "text",
        variables,
        shapes,
      ),
    ).toMatchObject({
      id: "candidate",
      name: "Candidate → Details → City",
      fieldPath: ["field_details", "field_city"],
      fieldType: "text",
      current: { kind: "text", value: "" },
    });
    expect(variableOptions("text", variables, shapes).map((variable) => variable.name)).toEqual([
      "Candidate → Details → City",
      "Candidate → Votes",
    ]);

    expect(
      variableInput(
        { kind: "variable", variableId: "candidate", fieldPath: ["field_image"] },
        "image",
        variables,
        shapes,
      ),
    ).toMatchObject({
      id: "candidate",
      name: "Candidate → Image",
      fieldPath: ["field_image"],
      fieldType: "image",
    });
    expect(variableOptions("image", variables, shapes).map((variable) => variable.name)).toEqual([
      "Candidate → Image",
    ]);
  });
  it("shows a Variable default as the editable current value", () => {
    const variable: SceneVariable = {
      id: "title",
      name: "Title",
      type: "text",
      defaultValue: "Draft title",
    };

    expect(
      variableInput({ kind: "variable", variableId: variable.id }, "text", [variable]),
    ).toMatchObject({
      id: variable.id,
      current: { kind: "text", value: "Draft title" },
    });
  });
  it("reads nested field fallbacks from a structured Variable default", () => {
    const variable: SceneVariable = {
      id: "candidate",
      name: "Candidate",
      type: { kind: "shape", shapeId: "profile" },
      defaultValue: { name: "Ada" },
    };
    const profile: Shape = {
      id: "profile",
      name: "Profile",
      fields: [{ id: "name", name: "Name", type: "text", required: true, defaultValue: "" }],
    };

    expect(
      variableInput(
        { kind: "variable", variableId: variable.id, fieldPath: ["name"] },
        "text",
        [variable],
        [profile],
      ),
    ).toMatchObject({ current: { kind: "text", value: "Ada" } });
  });
  it("normalizes numeric values for text property previews", () => {
    expect(textValueForPreview({ kind: "number", value: 42 })).toBe("42");
    expect(textValueForPreview({ kind: "text", value: "Headline" })).toBe("Headline");
  });
});

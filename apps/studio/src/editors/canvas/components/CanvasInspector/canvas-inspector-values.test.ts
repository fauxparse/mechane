import { describe, expect, it } from "vitest";

import type { BlockVariable } from "@mechane/domain/blocks";
import type { SlotElement, SlotExpansion } from "@mechane/domain/canvas";
import type { SceneVariable } from "@mechane/domain/graph";
import type { Shape, Type } from "@mechane/domain/shapes";
import {
  sizeConstraintKey,
  sizeValueNumber,
  sizeValueUnit,
  sizingForMode,
  slotExpansionOptions,
  slotInputOptions,
  slotInputReference,
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

const candidateShape: Shape = {
  id: "shape_candidate",
  name: "Candidate",
  fields: [
    { id: "field_name", name: "name", type: "text", required: true, defaultValue: "" },
    { id: "field_votes", name: "votes", type: "number", required: true, defaultValue: 0 },
    { id: "field_photo", name: "photo", type: "image", required: false, defaultValue: null },
  ],
};

const settingsShape: Shape = {
  id: "shape_settings",
  name: "settings",
  fields: [
    {
      id: "field_candidates",
      name: "candidates",
      type: { kind: "array", of: { kind: "shape", shapeId: candidateShape.id } },
      required: true,
      defaultValue: [],
    },
  ],
};

// References itself: traversal must stop instead of recursing through `parent`.
const sectionShape: Shape = {
  id: "shape_section",
  name: "Section",
  fields: [
    {
      id: "field_items",
      name: "items",
      type: { kind: "array", of: "text" },
      required: true,
      defaultValue: [],
    },
    {
      id: "field_parent",
      name: "parent",
      type: { kind: "shape", shapeId: "shape_section" },
      required: false,
      defaultValue: null,
    },
  ],
};

const slotShapes = [candidateShape, settingsShape, sectionShape];

const slotVariables: SceneVariable[] = [
  {
    id: "variable_candidates",
    name: "Candidates",
    type: { kind: "array", of: { kind: "shape", shapeId: candidateShape.id } },
  },
  { id: "variable_settings", name: "settings", type: { kind: "shape", shapeId: settingsShape.id } },
  { id: "variable_sections", name: "Sections", type: { kind: "shape", shapeId: sectionShape.id } },
  { id: "variable_totals", name: "Totals", type: { kind: "array", of: "number" } },
  { id: "variable_total", name: "Total", type: "number" },
  { id: "variable_blank", name: "Blank" },
];

const slotWith = (expansion?: SlotExpansion): SlotElement => ({
  id: "slot_list",
  type: "slot",
  blockId: "block_row",
  ...(expansion ? { expansion } : {}),
});

const blockInput = (type: Type): BlockVariable => ({
  id: "block_input",
  name: "Input",
  type,
  required: true,
});

describe("slot input options", () => {
  it("lists parent Variable arrays at the root and in nested Shape fields", () => {
    const options = slotExpansionOptions(slotVariables, slotShapes);

    expect(options).toHaveLength(4);
    expect(options.map((option) => [option.id, option.name])).toEqual([
      ["variable_candidates", "Candidates"],
      ["variable_settings", "settings → candidates"],
      ["variable_sections", "Sections → items"],
      ["variable_totals", "Totals"],
    ]);
    for (const option of options) {
      expect(option.source.kind).toBe("variable");
    }
    expect(options[0]).toMatchObject({
      fieldPath: [],
      fieldType: { kind: "array", of: { kind: "shape", shapeId: candidateShape.id } },
      source: { kind: "variable", variableId: "variable_candidates", fieldPath: [] },
    });
    expect(options[1]).toMatchObject({
      fieldPath: ["field_candidates"],
      source: {
        kind: "variable",
        variableId: "variable_settings",
        fieldPath: ["field_candidates"],
      },
    });
  });

  it("offers the current item of a Variable array expansion for a same-Shape Block input", () => {
    const slot = slotWith({ source: { kind: "variable", variableId: "variable_candidates" } });

    const options = slotInputOptions(
      slot,
      blockInput({ kind: "shape", shapeId: candidateShape.id }),
      slotVariables,
      slotShapes,
    );

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      id: "current-item",
      name: "Current item",
      fieldPath: [],
      fieldType: { kind: "shape", shapeId: candidateShape.id },
      source: { kind: "runtimeItem", fieldPath: [] },
    });
  });

  it("supplies number and text Block inputs from a number-array current item", () => {
    const slot = slotWith({ source: { kind: "variable", variableId: "variable_totals" } });

    for (const input of ["number", "text"] as const) {
      const options = slotInputOptions(slot, blockInput(input), slotVariables, slotShapes);
      expect(options.map((option) => [option.id, option.name, option.fieldPath])).toEqual([
        ["current-item", "Current item", []],
        ["variable_total", "Total", []],
      ]);
      expect(options[0]).toMatchObject({
        fieldType: "number",
        source: { kind: "runtimeItem", fieldPath: [] },
      });
    }
  });

  it("offers only compatible current-item fields", () => {
    const slot = slotWith({ source: { kind: "variable", variableId: "variable_candidates" } });

    expect(
      slotInputOptions(slot, blockInput("image"), slotVariables, slotShapes).map((option) => [
        option.name,
        option.fieldPath,
        option.source,
      ]),
    ).toEqual([
      [
        "Current item → photo",
        ["field_photo"],
        { kind: "runtimeItem", fieldPath: ["field_photo"] },
      ],
    ]);
    expect(slotInputOptions(slot, blockInput("color"), slotVariables, slotShapes)).toEqual([]);
  });

  it("expands a nested parent array and round-trips a nested item field through its persisted source", () => {
    const expansion = slotExpansionOptions(slotVariables, slotShapes).find(
      (option) => option.id === "variable_settings",
    );
    expect(expansion).toBeDefined();
    // The parent UI persists `option.source` as the Slot's expansion.
    const slot = slotWith({ source: expansion!.source });
    const input = blockInput("number");

    const options = slotInputOptions(slot, input, slotVariables, slotShapes);
    const votes = options.find((option) => option.name === "Current item → votes");
    expect(votes).toMatchObject({
      name: "Current item → votes",
      fieldPath: ["field_votes"],
      fieldType: "number",
      source: { kind: "runtimeItem", fieldPath: ["field_votes"] },
    });

    // Reading the persisted assignment back yields the same option identity.
    expect(slotInputReference(slot, input, votes!.source, slotVariables, slotShapes)).toMatchObject(
      {
        id: "current-item",
        name: "Current item → votes",
        fieldPath: ["field_votes"],
        source: { kind: "runtimeItem", fieldPath: ["field_votes"] },
      },
    );
  });

  it("keeps direct Variable choices distinct from the current item", () => {
    const slot = slotWith({ source: { kind: "variable", variableId: "variable_candidates" } });
    const input = blockInput("text");

    expect(
      slotInputOptions(slot, input, slotVariables, slotShapes).map((option) => [
        option.id,
        option.name,
      ]),
    ).toEqual([
      ["current-item", "Current item → name"],
      ["current-item", "Current item → votes"],
      ["variable_total", "Total"],
    ]);
    expect(
      slotInputReference(
        slot,
        input,
        { kind: "variable", variableId: "variable_total" },
        slotVariables,
        slotShapes,
      ),
    ).toMatchObject({
      id: "variable_total",
      name: "Total",
      fieldPath: [],
      source: { kind: "variable", variableId: "variable_total", fieldPath: [] },
    });
  });

  it("keeps unavailable assignments visible without offering them", () => {
    const slot = slotWith({ source: { kind: "variable", variableId: "variable_candidates" } });
    const input = blockInput("number");

    expect(
      slotInputReference(
        slot,
        input,
        { kind: "runtimeItem", fieldPath: ["field_missing"] },
        slotVariables,
        slotShapes,
      ),
    ).toMatchObject({
      id: "current-item",
      name: "Current item → Unavailable",
      fieldPath: ["field_missing"],
      source: { kind: "runtimeItem", fieldPath: ["field_missing"] },
    });
    expect(
      slotInputOptions(slot, input, slotVariables, slotShapes).some(
        (option) => option.id === "current-item" && option.fieldPath!.includes("field_missing"),
      ),
    ).toBe(false);

    // A Variable whose path no longer resolves still displays.
    expect(
      slotInputReference(
        slot,
        input,
        { kind: "variable", variableId: "variable_settings", fieldPath: ["field_nope"] },
        slotVariables,
        slotShapes,
      ),
    ).toMatchObject({ id: "variable_settings", name: "settings → Unavailable" });
    // A Variable that no longer exists has nothing to display.
    expect(
      slotInputReference(
        slot,
        input,
        { kind: "variable", variableId: "variable_deleted" },
        slotVariables,
        slotShapes,
      ),
    ).toBeNull();
  });

  it("falls back to direct Variable options when the expansion is absent or not a Variable array", () => {
    const input = blockInput("number");

    expect(
      slotInputOptions(slotWith(), input, slotVariables, slotShapes).map((option) => option.name),
    ).toEqual(["Total"]);
    expect(
      slotInputOptions(
        slotWith({ source: { kind: "literal", value: [1, 2] } }),
        input,
        slotVariables,
        slotShapes,
      ).map((option) => option.name),
    ).toEqual(["Total"]);
    expect(
      slotInputOptions(
        slotWith({ source: { kind: "variable", variableId: "variable_total" } }),
        input,
        slotVariables,
        slotShapes,
      ).map((option) => option.name),
    ).toEqual(["Total"]);
    expect(
      slotInputReference(slotWith(), input, { kind: "runtimeItem" }, slotVariables, slotShapes),
    ).toBeNull();
  });
});

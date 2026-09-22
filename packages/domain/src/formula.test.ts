import { describe, expect, it } from "vitest";
import { generateId, type StructuredValueId } from "./id";
import { evaluateFormula, renameFormulaIdentifier } from "./formula-runtime";
import { analyse, parse } from "./formula";
import type { Shape, Type } from "./shapes";
import type { StructuredValues } from "./structured-values";

const candidateShape: Shape = {
  id: "shape_candidate",
  name: "Candidate",
  fields: [
    { id: "field_name", name: "name", type: "text", required: true, defaultValue: "" },
    { id: "field_votes", name: "votes", type: "number", required: true, defaultValue: 0 },
    { id: "field_tagline", name: "tagline", type: "text", required: false, defaultValue: null },
  ],
};
const candidateType = {
  kind: "shape",
  shapeId: candidateShape.id,
} satisfies Extract<Type, { kind: "shape" }>;
const candidatesType = {
  kind: "array",
  of: candidateType,
} satisfies Extract<Type, { kind: "array" }>;

function candidates(values: readonly number[]): {
  value: { ref: StructuredValueId };
  structuredValues: StructuredValues;
} {
  const arrayId = generateId("structuredValue");
  const structuredValues: StructuredValues = {};
  const items = values.map((votes, index) => {
    const id = generateId("structuredValue");
    structuredValues[id] = {
      id,
      kind: "shape",
      type: candidateType,
      fields: {
        field_name: `Candidate ${index + 1}`,
        field_votes: votes,
        field_tagline: null,
      },
    };
    return { ref: id };
  });
  structuredValues[arrayId] = { id: arrayId, kind: "array", type: candidatesType, items };
  return { value: { ref: arrayId }, structuredValues };
}

describe("Formula", () => {
  it("parses synchronously with stable source spans and settled precedence", () => {
    const expression = parse("1 + 2 * -3 ^ 2 & ' votes'");
    expect(expression).toMatchObject({ type: "binary", operator: "&", from: 0, to: 25 });
    expect(parse("TRUE || false && true")).toMatchObject({ type: "binary", operator: "||" });
  });

  it.each([
    "null",
    "input.field",
    "input['field']",
    "items[.votes >= 10]",
    "[1, 2, 3]",
    "{name: 'Ada', votes: 3}",
    "IF(active, total, 0)",
    "numbers|SUM",
    "primary ?: fallback",
  ])("accepts vendored JEXL syntax: %s", (formula) => {
    expect(parse(formula)).toMatchObject({ from: 0, to: formula.length });
  });

  it("auto-maps Shape fields and evaluates the v1 Function catalogue", () => {
    const input = candidates([2, 3, 5]);
    const result = evaluateFormula({
      formula: '"Tally: " & SUM(candidates.votes) & " votes across " & COUNT(candidates)',
      transformerId: "transformer_tally",
      outputType: "text",
      inputs: [{ name: "candidates", type: candidatesType, value: input.value }],
      structuredValues: input.structuredValues,
      shapes: [candidateShape],
    });
    expect(result.value).toBe("Tally: 10 votes across 3");
    expect(result.diagnostics).toEqual([]);
  });

  it("preserves passed-through references and derives stable computed array ids", () => {
    const input = candidates([2, 3]);
    const passed = evaluateFormula({
      formula: "candidates[0]",
      transformerId: "transformer_pick",
      outputType: candidateType,
      inputs: [{ name: "candidates", type: candidatesType, value: input.value }],
      structuredValues: input.structuredValues,
      shapes: [candidateShape],
    });
    const inputArray = input.structuredValues[input.value.ref];
    if (inputArray?.kind !== "array") throw new Error("Expected candidate array.");
    expect(passed.value).toEqual(inputArray.items[0]);

    const first = evaluateFormula({
      formula: "candidates.votes",
      transformerId: "transformer_votes",
      outputType: { kind: "array", of: "number" },
      inputs: [{ name: "candidates", type: candidatesType, value: input.value }],
      structuredValues: input.structuredValues,
      shapes: [candidateShape],
    });
    const second = evaluateFormula({
      formula: "candidates.votes",
      transformerId: "transformer_votes",
      outputType: { kind: "array", of: "number" },
      inputs: [{ name: "candidates", type: candidatesType, value: input.value }],
      structuredValues: input.structuredValues,
      shapes: [candidateShape],
    });
    const otherProducer = evaluateFormula({
      formula: "candidates.votes",
      transformerId: "transformer_other",
      outputType: { kind: "array", of: "number" },
      inputs: [{ name: "candidates", type: candidatesType, value: input.value }],
      structuredValues: input.structuredValues,
      shapes: [candidateShape],
    });
    expect(first.value).toEqual(second.value);
    expect(first.value).not.toEqual(otherProducer.value);
    expect(Object.keys(first.computedStructuredValues)).toEqual([expect.stringMatching(/^y:/)]);
  });

  it("propagates absence through concatenation while aggregates return zero", () => {
    const input = candidates([]);
    expect(
      evaluateFormula({
        formula: "SUM(candidates)",
        transformerId: "transformer_sum",
        outputType: "number",
        inputs: [{ name: "candidates", type: { kind: "array", of: "number" }, value: input.value }],
        structuredValues: input.structuredValues,
        shapes: [candidateShape],
      }).value,
    ).toBe(0);
    const absentResult = analyse('missing & " text"', {
      ports: [{ name: "missing", type: "text", value: { kind: "absent", because: "unwired" } }],
      shapes: {},
      expected: "text",
    });
    expect(absentResult.value).toMatchObject({ kind: "absent" });
  });

  it("enforces the shared deterministic step budget", () => {
    const numbersType: Type = { kind: "array", of: "number" };
    const id = generateId("structuredValue");
    const structuredValues: StructuredValues = {
      [id]: {
        id,
        kind: "array",
        type: numbersType,
        items: Array.from({ length: 10_001 }, () => 1),
      },
    };
    const result = evaluateFormula({
      formula: "SUM(numbers)",
      transformerId: "transformer_budget",
      outputType: "number",
      inputs: [{ name: "numbers", type: numbersType, value: { ref: id } }],
      structuredValues,
      shapes: [],
    });
    expect(result.value).toBeUndefined();
    expect(result.diagnostics.at(-1)).toMatchObject({
      category: "evaluationLimitExceeded",
      severity: "runtime",
    });
  });

  it("renames only input identifier spans", () => {
    expect(
      renameFormulaIdentifier('SUM(votes.count) & "votes" & record.votes', "votes", "items"),
    ).toEqual({
      formula: 'SUM(items.count) & "votes" & record.votes',
      references: 1,
    });
  });
});

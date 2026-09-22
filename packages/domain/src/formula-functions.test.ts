import { describe, expect, it } from "vitest";
import { absent, analyse, number, type FormulaScope, type FormulaValue } from "./formula";

const EMPTY_SCOPE = { ports: [], shapes: {} } satisfies FormulaScope;

const upstreamFailure: FormulaValue = {
  kind: "failure",
  category: "invalidFieldValue",
  message: "Upstream value failed.",
  from: 0,
  to: 1,
};

describe("MIN", () => {
  it("returns the smallest present number and supports pipe use", () => {
    const result = analyse("numbers|MIN", {
      ports: [
        {
          name: "numbers",
          type: { array: "number" },
          value: { kind: "array", items: [number(3), absent("missing"), number(-2), number(7)] },
        },
      ],
      shapes: {},
    });
    expect(result.value).toEqual(number(-2));
    expect(result.diagnostics).toEqual([]);
  });

  it("returns Typed Absence when no number is present", () => {
    const result = analyse("MIN(numbers)", {
      ports: [{ name: "numbers", type: { array: "number" }, value: absent("unwired") }],
      shapes: {},
    });
    expect(result.value).toEqual(absent("MIN has no present numbers"));
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ category: "missingRequiredValue", severity: "runtime" }),
    ]);
  });

  it("blocks an invalid argument Type", () => {
    const result = analyse('MIN(["three"])', EMPTY_SCOPE);
    expect(result.value).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        category: "invalidFunctionArgument",
        severity: "blocking",
      }),
    ]);
  });

  it("propagates runtime failures from an array item", () => {
    const result = analyse("MIN(numbers)", {
      ports: [
        {
          name: "numbers",
          type: { array: "number" },
          value: { kind: "array", items: [number(3), upstreamFailure] },
        },
      ],
      shapes: {},
    });
    expect(result.value).toEqual(upstreamFailure);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ category: "invalidFieldValue", severity: "runtime" }),
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { absent, analyse, number, text, type FormulaScope, type FormulaValue } from "./formula";

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

describe("MAX", () => {
  it("returns the largest present number and supports pipe use", () => {
    const result = analyse("numbers|MAX", {
      ports: [
        {
          name: "numbers",
          type: { array: "number" },
          value: { kind: "array", items: [number(3), absent("missing"), number(-2), number(7)] },
        },
      ],
      shapes: {},
    });
    expect(result.value).toEqual(number(7));
    expect(result.diagnostics).toEqual([]);
  });

  it("returns Typed Absence when no number is present", () => {
    const result = analyse("MAX(numbers)", {
      ports: [{ name: "numbers", type: { array: "number" }, value: absent("unwired") }],
      shapes: {},
    });
    expect(result.value).toEqual(absent("MAX has no present numbers"));
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ category: "missingRequiredValue", severity: "runtime" }),
    ]);
  });

  it("blocks an invalid argument Type", () => {
    const result = analyse('MAX(["seven"])', EMPTY_SCOPE);
    expect(result.value).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        category: "invalidFunctionArgument",
        severity: "blocking",
      }),
    ]);
  });

  it("propagates runtime failures from an array item", () => {
    const result = analyse("MAX(numbers)", {
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

describe("ROUND", () => {
  it("rounds decimal and whole-place precision and supports pipe use", () => {
    expect(analyse("2.675|ROUND(2)", EMPTY_SCOPE).value).toEqual(number(2.68));
    expect(analyse("1234|ROUND(-2)", EMPTY_SCOPE).value).toEqual(number(1200));
  });

  it("propagates Typed Absence", () => {
    const result = analyse("ROUND(value, 2)", {
      ports: [{ name: "value", type: "number", value: absent("unwired") }],
      shapes: {},
    });
    expect(result.value).toEqual(absent("unwired"));
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ category: "missingRequiredValue", severity: "runtime" }),
    ]);
  });

  it("blocks an invalid argument Type", () => {
    const result = analyse('ROUND("12.5", 1)', EMPTY_SCOPE);
    expect(result.value).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        category: "invalidFunctionArgument",
        severity: "blocking",
      }),
    ]);
  });

  it("reports an invalid runtime precision", () => {
    const result = analyse("ROUND(12.5, 1.5)", EMPTY_SCOPE);
    expect(result.value).toEqual(
      expect.objectContaining({ kind: "failure", category: "invalidFunctionArgument" }),
    );
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        category: "invalidFunctionArgument",
        severity: "runtime",
      }),
    ]);
  });
});

describe("LEN", () => {
  it("counts Unicode characters and supports pipe use", () => {
    expect(analyse('"A🙂"|LEN', EMPTY_SCOPE).value).toEqual(number(2));
    expect(analyse('LEN("")', EMPTY_SCOPE).value).toEqual(number(0));
  });

  it("propagates Typed Absence", () => {
    const result = analyse("LEN(value)", {
      ports: [{ name: "value", type: "text", value: absent("unwired") }],
      shapes: {},
    });
    expect(result.value).toEqual(absent("unwired"));
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ category: "missingRequiredValue", severity: "runtime" }),
    ]);
  });

  it("blocks an invalid argument Type", () => {
    const result = analyse("LEN(12)", EMPTY_SCOPE);
    expect(result.value).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        category: "invalidFunctionArgument",
        severity: "blocking",
      }),
    ]);
  });

  it("propagates runtime failures", () => {
    const result = analyse("value|LEN", {
      ports: [{ name: "value", type: "text", value: upstreamFailure }],
      shapes: {},
    });
    expect(result.value).toEqual(upstreamFailure);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ category: "invalidFieldValue", severity: "runtime" }),
    ]);
  });
});

describe("UPPER", () => {
  it("uppercases text without locale input and supports pipe use", () => {
    expect(analyse('"straße"|UPPER', EMPTY_SCOPE).value).toEqual(text("STRASSE"));
  });

  it("propagates Typed Absence", () => {
    const result = analyse("UPPER(value)", {
      ports: [{ name: "value", type: "text", value: absent("unwired") }],
      shapes: {},
    });
    expect(result.value).toEqual(absent("unwired"));
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ category: "missingRequiredValue", severity: "runtime" }),
    ]);
  });

  it("blocks an invalid argument Type", () => {
    const result = analyse("UPPER(12)", EMPTY_SCOPE);
    expect(result.value).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        category: "invalidFunctionArgument",
        severity: "blocking",
      }),
    ]);
  });

  it("propagates runtime failures", () => {
    const result = analyse("value|UPPER", {
      ports: [{ name: "value", type: "text", value: upstreamFailure }],
      shapes: {},
    });
    expect(result.value).toEqual(upstreamFailure);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ category: "invalidFieldValue", severity: "runtime" }),
    ]);
  });
});

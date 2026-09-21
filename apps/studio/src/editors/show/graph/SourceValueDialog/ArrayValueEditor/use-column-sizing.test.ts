import { describe, expect, it } from "vitest";

import { distributeColumnSizes, resizeColumnSizes } from "./use-column-sizing";

describe("column sizing", () => {
  it("fills available width without shrinking below the minimum", () => {
    expect(distributeColumnSizes(["a", "b", "c"], undefined, 600)).toEqual({
      a: 200,
      b: 200,
      c: 200,
    });
    expect(distributeColumnSizes(["a", "b", "c"], undefined, 200)).toEqual({
      a: 96,
      b: 96,
      c: 96,
    });
  });

  it("takes positive resize space from columns to the right", () => {
    expect(
      resizeColumnSizes({
        columnIds: ["a", "b", "c"],
        startSizes: { a: 200, b: 200, c: 200 },
        columnId: "a",
        delta: 80,
      }),
    ).toEqual({ a: 280, b: 120, c: 200 });
  });

  it("lets the active column grow when right columns reach minimum", () => {
    expect(
      resizeColumnSizes({
        columnIds: ["a", "b"],
        startSizes: { a: 200, b: 96 },
        columnId: "a",
        delta: 80,
      }),
    ).toEqual({ a: 280, b: 96 });
  });

  it("caps growth at the available width after right-side minimums", () => {
    expect(
      resizeColumnSizes({
        columnIds: ["a", "b", "c"],
        startSizes: { a: 140, b: 140, c: 136 },
        columnId: "a",
        delta: 100,
        availableWidth: 500,
        fixedWidth: 84,
      }),
    ).toEqual({ a: 224, b: 96, c: 96 });
  });
});

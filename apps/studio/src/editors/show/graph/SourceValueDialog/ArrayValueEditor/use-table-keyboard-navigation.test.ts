import { describe, expect, it } from "vitest";

import { nextTableCell } from "./use-table-keyboard-navigation";

describe("table keyboard navigation", () => {
  it("moves through cells and wraps between rows", () => {
    expect(nextTableCell({ rowIndex: 0, columnIndex: 1 }, "ArrowRight", 3, 3)).toEqual({
      rowIndex: 0,
      columnIndex: 2,
    });
    expect(nextTableCell({ rowIndex: 0, columnIndex: 2 }, "ArrowRight", 3, 3)).toEqual({
      rowIndex: 1,
      columnIndex: 0,
    });
    expect(nextTableCell({ rowIndex: 1, columnIndex: 0 }, "ArrowLeft", 3, 3)).toEqual({
      rowIndex: 0,
      columnIndex: 2,
    });
  });

  it("supports home end and paging within table bounds", () => {
    expect(nextTableCell({ rowIndex: 7, columnIndex: 2 }, "Home", 20, 4)).toEqual({
      rowIndex: 7,
      columnIndex: 0,
    });
    expect(nextTableCell({ rowIndex: 7, columnIndex: 0 }, "End", 20, 4)).toEqual({
      rowIndex: 7,
      columnIndex: 3,
    });
    expect(nextTableCell({ rowIndex: 2, columnIndex: 1 }, "PageDown", 8, 4)).toEqual({
      rowIndex: 7,
      columnIndex: 1,
    });
    expect(nextTableCell({ rowIndex: 2, columnIndex: 1 }, "PageUp", 8, 4)).toEqual({
      rowIndex: 0,
      columnIndex: 1,
    });
  });

  it("requests a row when Enter leaves the final cell", () => {
    expect(nextTableCell({ rowIndex: 1, columnIndex: 2 }, "Enter", 2, 3)).toBe("create-row");
  });
});

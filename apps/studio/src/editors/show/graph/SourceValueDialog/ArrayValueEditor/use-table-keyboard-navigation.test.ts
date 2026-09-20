import { describe, expect, it } from "vitest";

import { nextTableCell, tableCellNavigationKey } from "./use-table-keyboard-navigation";

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

  it("keeps horizontal arrows in a text input until a collapsed caret reaches an edge", () => {
    expect(
      tableCellNavigationKey({
        key: "ArrowRight",
        target: "input",
        selectionStart: 2,
        selectionEnd: 2,
        valueLength: 5,
      }),
    ).toBeNull();
    expect(
      tableCellNavigationKey({
        key: "ArrowRight",
        target: "input",
        selectionStart: 5,
        selectionEnd: 5,
        valueLength: 5,
      }),
    ).toBe("ArrowRight");
    expect(
      tableCellNavigationKey({
        key: "ArrowLeft",
        target: "input",
        selectionStart: 0,
        selectionEnd: 5,
        valueLength: 5,
      }),
    ).toBeNull();
  });

  it("preserves native input and button keyboard behavior", () => {
    expect(tableCellNavigationKey({ key: "Home", target: "input" })).toBeNull();
    expect(tableCellNavigationKey({ key: "End", target: "input" })).toBeNull();
    expect(tableCellNavigationKey({ key: "Enter", target: "button" })).toBeNull();
    expect(tableCellNavigationKey({ key: " ", target: "button" })).toBeNull();
    expect(tableCellNavigationKey({ key: "ArrowDown", target: "button" })).toBe("ArrowDown");
  });

  it("ignores modified and composing key presses", () => {
    expect(tableCellNavigationKey({ key: "ArrowDown", target: "input", metaKey: true })).toBeNull();
    expect(
      tableCellNavigationKey({ key: "ArrowDown", target: "input", isComposing: true }),
    ).toBeNull();
  });
});

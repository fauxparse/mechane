import { describe, expect, it } from "vitest";

import {
  assertValidCanvas,
  hasCornerRadius,
  InvalidCanvasError,
  normalizeElementSizing,
  type Canvas,
} from "./canvas";

const ROOT: Canvas = {
  kind: "scene",
  root: { id: "root", type: "frame", children: [] },
};

describe("Canvas model", () => {
  it("accepts a nested Frame hierarchy with ranked children", () => {
    const canvas: Canvas = {
      ...ROOT,
      root: {
        ...ROOT.root,
        children: [
          {
            id: "frame",
            type: "frame",
            rank: "a",
            children: [{ id: "text", type: "text", rank: "a", content: "Hello" }],
          },
        ],
      },
    };

    expect(assertValidCanvas(canvas)).toBe(canvas);
  });
  it("normalizes legacy sizing fields into one canonical representation", () => {
    expect(
      normalizeElementSizing({
        id: "rect",
        type: "rect",
        width: { mode: "fixed", value: 100 },
        minHeight: 20,
        layout: {
          width: { mode: "fixed", value: 320 },
          minWidth: 40,
          rotation: 90,
        },
        sizing: {
          height: { mode: "fixed", value: 80 },
          minHeight: 30,
        },
      }),
    ).toEqual({
      id: "rect",
      type: "rect",
      layout: { rotation: 90 },
      sizing: {
        width: { mode: "fixed", value: 320 },
        height: { mode: "fixed", value: 80 },
        minWidth: 40,
        minHeight: 30,
      },
    });
  });
  it("accepts auto gap on a Frame", () => {
    expect(
      assertValidCanvas({
        root: { id: "root", type: "frame", gap: "auto", children: [] },
      }),
    ).toMatchObject({ root: { gap: "auto" } });
  });
  it("recognizes elements that support corner radii", () => {
    expect(hasCornerRadius({ id: "rect", type: "rect" })).toBe(true);
    expect(hasCornerRadius({ id: "frame", type: "frame" })).toBe(true);
    expect(hasCornerRadius({ id: "text", type: "text" })).toBe(false);
  });
  it("rejects invalid Frame gap values", () => {
    expect(() =>
      assertValidCanvas({
        root: { id: "root", type: "frame", gap: -1, children: [] },
      }),
    ).toThrow(/gap must be auto or a finite non-negative number/);
  });

  it.each([
    ["a non-Frame root", { root: { id: "root", type: "text" } }],
    [
      "duplicate ids",
      { root: { id: "root", type: "frame", children: [{ id: "root", type: "rect" }] } },
    ],
    [
      "children on a rect",
      {
        root: {
          id: "root",
          type: "frame",
          children: [{ id: "rect", type: "rect", children: [{ id: "nested", type: "text" }] }],
        },
      },
    ],
    [
      "duplicate sibling ranks",
      {
        root: {
          id: "root",
          type: "frame",
          children: [
            { id: "a", type: "rect", rank: "x" },
            { id: "b", type: "rect", rank: "x" },
          ],
        },
      },
    ],
  ])("rejects %s", (_reason, canvas) => {
    expect(() => assertValidCanvas(canvas as Canvas)).toThrow(InvalidCanvasError);
  });

  it("requires ordered gradients with at least two colored stops", () => {
    expect(() =>
      assertValidCanvas({
        root: {
          id: "root",
          type: "frame",
          fill: { kind: "linear", stops: [{ color: "red", position: 0 }] },
        },
      }),
    ).toThrow(/at least two stops/);

    expect(() =>
      assertValidCanvas({
        root: {
          id: "root",
          type: "frame",
          fill: {
            kind: "linear",
            stops: [
              { color: "red", position: 0.8 },
              { color: "blue", position: 0.2 },
            ],
          },
        },
      }),
    ).toThrow(/invalid gradient stops/);
  });
  it("accepts and validates element strokes", () => {
    expect(
      assertValidCanvas({
        root: {
          id: "root",
          type: "frame",
          stroke: { width: 2, style: "dotted", color: "#112233" },
        },
      }),
    ).toMatchObject({ root: { stroke: { width: 2, style: "dotted" } } });

    expect(() =>
      assertValidCanvas({
        root: {
          id: "root",
          type: "frame",
          stroke: { width: -1, style: "solid", color: "#112233" },
        },
      }),
    ).toThrow(/stroke width must be finite and non-negative/);
  });
});

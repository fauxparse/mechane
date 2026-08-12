import { describe, expect, it } from "vitest";

import { assertValidCanvas, InvalidCanvasError, type Canvas } from "./canvas";

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
});

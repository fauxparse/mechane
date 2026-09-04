import { describe, expect, it } from "vitest";

import { edgeLayoutKey, parseEdgeLayoutKey, pruneEdgeLayout } from "./edge-layout";

describe("edge layout keys", () => {
  it("names a run dragged across itself, and a jog at either end of one", () => {
    expect(edgeLayoutKey(2)).toBe("2");
    expect(edgeLayoutKey(0, "head")).toBe("0.head");
    expect(edgeLayoutKey(4, "tail")).toBe("4.tail");
  });

  it("reads back what it writes", () => {
    expect(parseEdgeLayoutKey(edgeLayoutKey(2))).toEqual({ runIndex: 2, jog: null });
    expect(parseEdgeLayoutKey(edgeLayoutKey(0, "head"))).toEqual({ runIndex: 0, jog: "head" });
    expect(parseEdgeLayoutKey(edgeLayoutKey(4, "tail"))).toEqual({ runIndex: 4, jog: "tail" });
  });

  it("names nothing for a key it doesn't recognise", () => {
    for (const key of ["", "x", "-1", "1.5", "0:head", "0.middle", "0.head.tail", "head"]) {
      expect(parseEdgeLayoutKey(key)).toBeNull();
    }
  });
});

describe("pruneEdgeLayout", () => {
  it("keeps every handle a route can be dragged by", () => {
    // The jogs are the case that mattered: the edit codec used to read a key
    // as a run index and require an integer, so `"0.head"` — `NaN` — was
    // dropped on its way to the database and every jog came back flat.
    const layout = { HVH: { "1": -24, "0.head": 60, "2.tail": -12 } };
    expect(pruneEdgeLayout(layout)).toEqual(layout);
  });

  it("drops what a layout has no business remembering", () => {
    expect(
      pruneEdgeLayout({
        HVH: {
          "1": 0, // where routing put it: not a drag
          "2": Number.POSITIVE_INFINITY, // a drag through a zero scale
          "0:head": 5, // not a handle
          "0.middle": 5, // not a jog
        },
      }),
    ).toBeNull();
  });

  it("drops a signature with nothing left, and the layout with nothing left", () => {
    expect(pruneEdgeLayout({ HVH: {}, HVHVH: { "1": 8 } })).toEqual({ HVHVH: { "1": 8 } });
    expect(pruneEdgeLayout({ HVH: {} })).toBeNull();
    expect(pruneEdgeLayout({})).toBeNull();
  });
});

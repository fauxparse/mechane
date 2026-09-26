import { describe, expect, it } from "vitest";

import { newCanvasRootProperties } from "./canvas-defaults";

describe("new Canvas roots", () => {
  it("uses white for the first Canvas of a kind and accepts inherited fills", () => {
    expect(newCanvasRootProperties()).toMatchObject({ fill: "#FFFFFF" });
    expect(newCanvasRootProperties("#123456")).toMatchObject({ fill: "#123456" });
  });
});

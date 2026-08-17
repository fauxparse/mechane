import { describe, expect, it } from "vitest";

import { newCanvasRootProperties } from "./canvas-defaults";

describe("new Canvas roots", () => {
  it("clip their contents by default", () => {
    expect(newCanvasRootProperties()).toMatchObject({ clip: true });
  });
});

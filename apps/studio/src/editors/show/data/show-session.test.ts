import { describe, expect, it } from "vitest";

import { rememberedShowViewport, rememberShowViewport } from "./show-session";

describe("Show Editor viewport session state", () => {
  it("remembers the latest viewport independently for each Show", () => {
    const viewport = { x: -80, y: 48, zoom: 1.25 };
    rememberShowViewport("show-viewport", viewport);
    rememberShowViewport("show-other-viewport", { x: 0, y: 0, zoom: 1 });

    expect(rememberedShowViewport("show-viewport")).toEqual(viewport);
    expect(rememberedShowViewport("show-other-viewport")).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(rememberedShowViewport("show-missing-viewport")).toBeUndefined();
  });
});

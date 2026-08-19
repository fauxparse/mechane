import { afterEach, describe, expect, it, vi } from "vitest";

import { validateImageFile } from "./validation";

describe("validateImageFile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects files that exceed the source byte limit", async () => {
    const file = new File([new Uint8Array(11)], "large.png", { type: "image/png" });

    await expect(validateImageFile(file, { maxSourceBytes: 10 })).rejects.toMatchObject({
      code: "SOURCE_TOO_LARGE",
    });
  });

  it("validates width and height independently", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 1600, height: 900, close: vi.fn() })),
    );
    const file = new File(["image"], "wide.png", { type: "image/png" });

    await expect(
      validateImageFile(file, { maxWidth: 1200, maxHeight: 1000 }),
    ).rejects.toMatchObject({
      code: "DIMENSION_LIMIT_EXCEEDED",
    });
    await expect(validateImageFile(file, { maxWidth: 2000, maxHeight: 800 })).rejects.toMatchObject(
      {
        code: "DIMENSION_LIMIT_EXCEEDED",
      },
    );
  });

  it("returns decoded dimensions for a valid file", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 640, height: 480, close: vi.fn() })),
    );
    const file = new File(["image"], "valid.png", { type: "image/png" });

    await expect(validateImageFile(file)).resolves.toEqual({ width: 640, height: 480 });
  });
});

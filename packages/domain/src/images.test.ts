import { describe, expect, it } from "vitest";

import { assertValidImageName, InvalidImageNameError, MAX_IMAGE_NAME_LENGTH } from "./images";

describe("assertValidImageName", () => {
  it("trims leading and trailing whitespace", () => {
    expect(assertValidImageName("  stage-lights.png  ")).toBe("stage-lights.png");
  });

  it("rejects empty names", () => {
    expect(() => assertValidImageName("   ")).toThrow(InvalidImageNameError);
  });

  it("rejects names over the length limit", () => {
    expect(() => assertValidImageName("x".repeat(MAX_IMAGE_NAME_LENGTH + 1))).toThrow(
      InvalidImageNameError,
    );
  });
});

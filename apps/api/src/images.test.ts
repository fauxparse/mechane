import { describe, expect, it } from "vitest";

import { ImageProcessingError, processImage } from "./images";

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes, 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

describe("server image policy", () => {
  it("validates PNG dimensions and produces immutable metadata", () => {
    const result = processImage(png(320, 180), "image/png");
    expect(result).toMatchObject({ width: 320, height: 180, mimeType: "image/png" });
    expect(result.digest).toHaveLength(64);
    expect(result.blurHash).toHaveLength(32);
  });

  it("rejects executable SVG content", () => {
    expect(() =>
      processImage(Buffer.from('<svg onload="alert(1)" viewBox="0 0 10 10"/>'), "image/svg+xml"),
    ).toThrowError(new ImageProcessingError("MALFORMED_IMAGE", "SVG contains executable content."));
  });

  it("rejects images beyond the axis policy", () => {
    expect(() => processImage(png(8001, 1), "image/png")).toThrowError(
      expect.objectContaining({ code: "DIMENSION_LIMIT_EXCEEDED" }),
    );
  });
});

import { DEFAULT_IMAGE_UPLOAD_POLICY } from "@mechane/domain/images";
import { describe, expect, it } from "vitest";

import { ImageProcessingError, processImage } from "./images";

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes, 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function pngBytes(byteLength: number): Buffer {
  const bytes = Buffer.alloc(byteLength);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes, 0);
  bytes.writeUInt32BE(1, 16);
  bytes.writeUInt32BE(1, 20);
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

  it("accepts a ten-megabyte normalized image and rejects the next byte", () => {
    const accepted = pngBytes(DEFAULT_IMAGE_UPLOAD_POLICY.maxNormalizedBytes);
    expect(processImage(accepted, "image/png").byteLength).toBe(
      DEFAULT_IMAGE_UPLOAD_POLICY.maxNormalizedBytes,
    );

    const rejected = pngBytes(DEFAULT_IMAGE_UPLOAD_POLICY.maxNormalizedBytes + 1);
    expect(() => processImage(rejected, "image/png")).toThrowError(
      new ImageProcessingError(
        "OUTPUT_TOO_LARGE",
        "The normalized image exceeds the output size limit.",
      ),
    );
  });
});

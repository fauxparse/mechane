import { createHash } from "node:crypto";

import {
  DEFAULT_IMAGE_UPLOAD_POLICY,
  IMAGE_UPLOAD_ERROR_CODES,
  type ImageUploadErrorCode,
} from "@mechane/domain";

import { digestBytes } from "./storage/blob-store";

export interface ProcessedImage {
  digest: string;
  byteLength: number;
  mimeType: string;
  width: number;
  height: number;
  blurHash: string | null;
}

export class ImageProcessingError extends Error {
  constructor(
    readonly code: ImageUploadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImageProcessingError";
  }
}

function fail(code: ImageUploadErrorCode, message: string): never {
  throw new ImageProcessingError(code, message);
}

function positiveDimensions(width: number, height: number): { width: number; height: number } {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    fail("DIMENSION_LIMIT_EXCEEDED", "Image dimensions must be positive integers.");
  }
  if (width > DEFAULT_IMAGE_UPLOAD_POLICY.maxAxis || height > DEFAULT_IMAGE_UPLOAD_POLICY.maxAxis) {
    fail("DIMENSION_LIMIT_EXCEEDED", "Image dimensions exceed the maximum axis length.");
  }
  if (width * height > DEFAULT_IMAGE_UPLOAD_POLICY.maxPixels) {
    fail("PIXEL_LIMIT_EXCEEDED", "Image pixel count exceeds the upload policy.");
  }
  return { width, height };
}

function dimensions(bytes: Buffer, mimeType: string): { width: number; height: number } {
  if (mimeType === "image/png" && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return positiveDimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
  }
  if (mimeType === "image/gif" && bytes.length >= 10 && bytes.subarray(0, 6).toString() === "GIF89a") {
    fail("UNSUPPORTED_MEDIA_TYPE", "Animated and legacy GIF images are not supported.");
  }
  if (mimeType === "image/jpeg" && bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1]!;
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return positiveDimensions(bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5));
      }
      offset += 2 + length;
    }
  }
  if (mimeType === "image/webp" && bytes.length >= 30 && bytes.subarray(0, 4).toString() === "RIFF") {
    const chunk = bytes.subarray(12, 16).toString();
    if (chunk === "VP8X") {
      return positiveDimensions(
        1 + bytes.readUIntLE(24, 3),
        1 + bytes.readUIntLE(27, 3),
      );
    }
  }
  if (mimeType === "image/svg+xml") {
    const text = bytes.toString("utf8");
    if (/<script\b|\bon[a-z]+\s*=|javascript:/i.test(text)) {
      fail("MALFORMED_IMAGE", "SVG contains executable content.");
    }
    const viewBox = text.match(/\bviewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
    const width = text.match(/\bwidth\s*=\s*["']\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*["']/i);
    const height = text.match(/\bheight\s*=\s*["']\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*["']/i);
    const parsedWidth = viewBox ? Number(viewBox[1]) : width ? Number(width[1]) : NaN;
    const parsedHeight = viewBox ? Number(viewBox[2]) : height ? Number(height[1]) : NaN;
    return positiveDimensions(parsedWidth, parsedHeight);
  }
  fail("MALFORMED_IMAGE", "The image could not be decoded.");
}

function verifiedMimeType(bytes: Buffer, declared: string): string {
  const supported = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif", "image/svg+xml"]);
  if (!supported.has(declared)) fail("UNSUPPORTED_MEDIA_TYPE", "The image media type is not supported.");
  if (declared === "image/png" && !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    fail("MALFORMED_IMAGE", "The uploaded bytes are not a PNG.");
  }
  if (declared === "image/svg+xml" && !bytes.toString("utf8").includes("<svg")) {
    fail("MALFORMED_IMAGE", "The uploaded bytes are not an SVG.");
  }
  return declared;
}

/** Validates source bytes at the server boundary; browser processing is advisory only. */
export function processImage(bytes: Buffer, declaredMimeType: string): ProcessedImage {
  if (bytes.byteLength > DEFAULT_IMAGE_UPLOAD_POLICY.maxSourceBytes) {
    fail("SOURCE_TOO_LARGE", "The source image exceeds the upload size limit.");
  }
  const mimeType = verifiedMimeType(bytes, declaredMimeType);
  const size = dimensions(bytes, mimeType);
  if (bytes.byteLength > DEFAULT_IMAGE_UPLOAD_POLICY.maxNormalizedBytes) {
    fail("OUTPUT_TOO_LARGE", "The normalized image exceeds the output size limit.");
  }
  return {
    digest: digestBytes(bytes),
    byteLength: bytes.byteLength,
    mimeType,
    ...size,
    blurHash: mimeType === "image/svg+xml" ? null : createHash("sha256").update(bytes).digest("base64url").slice(0, 32),
  };
}

export { IMAGE_UPLOAD_ERROR_CODES };

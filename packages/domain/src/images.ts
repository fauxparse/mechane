import type { ImageAssetId, ShowId } from "./id";

export const IMAGE_ASSET_STATES = ["active", "deleted"] as const;
export type ImageAssetState = (typeof IMAGE_ASSET_STATES)[number];

export interface ImageAsset {
  id: ImageAssetId;
  showId: ShowId;
  blobDigest: string;
  revision: string;
  width: number;
  height: number;
  mimeType: string;
  alt: string;
  blurHash: string | null;
  state: ImageAssetState;
  sourceAssetId: ImageAssetId | null;
}

export interface ImageUploadPolicy {
  maxSourceBytes: number;
  maxPixels: number;
  maxAxis: number;
  maxNormalizedBytes: number;
  sessionTtlMs: number;
  candidateTtlMs: number;
}

export const DEFAULT_IMAGE_UPLOAD_POLICY: ImageUploadPolicy = {
  maxSourceBytes: 25 * 1024 * 1024,
  maxPixels: 40_000_000,
  maxAxis: 8_000,
  maxNormalizedBytes: 10 * 1024 * 1024,
  sessionTtlMs: 60 * 60 * 1000,
  candidateTtlMs: 24 * 60 * 60 * 1000,
};

export const IMAGE_UPLOAD_ERROR_CODES = [
  "UNSUPPORTED_MEDIA_TYPE",
  "MALFORMED_IMAGE",
  "SOURCE_TOO_LARGE",
  "PIXEL_LIMIT_EXCEEDED",
  "DIMENSION_LIMIT_EXCEEDED",
  "OUTPUT_TOO_LARGE",
  "INTEGRITY_MISMATCH",
  "SESSION_EXPIRED",
  "UPLOAD_CANCELLED",
  "PROCESSING_FAILED",
  "STORAGE_UNAVAILABLE",
  "NETWORK_FAILURE",
] as const;
export type ImageUploadErrorCode = (typeof IMAGE_UPLOAD_ERROR_CODES)[number];

export function assertSuggestedImageDimensions(
  value: unknown,
): asserts value is { width: number; height: number } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Suggested image dimensions must be positive integer pixels no greater than 8000.");
  }
  if (!("width" in value) || !("height" in value)) {
    throw new Error("Suggested image dimensions must be positive integer pixels no greater than 8000.");
  }
  const width = value.width;
  const height = value.height;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > DEFAULT_IMAGE_UPLOAD_POLICY.maxAxis ||
    height > DEFAULT_IMAGE_UPLOAD_POLICY.maxAxis
  ) {
    throw new Error("Suggested image dimensions must be positive integer pixels no greater than 8000.");
  }
}

import { afterEach, describe, expect, it, vi } from "vitest";

import { imageDeliveryUrl } from "./images";

describe("image delivery URLs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("routes new images through the public blob URL", () => {
    vi.stubEnv("BLOB_PUBLIC_URL", "https://images.mechane.live/blobs/");
    expect(imageDeliveryUrl("asset/alice", "seed-v1", "digest/abc")).toBe(
      "https://images.mechane.live/blobs/digest%2Fabc",
    );
  });

  it("keeps the API route for legacy delivery URLs", () => {
    vi.stubEnv("BLOB_PUBLIC_URL", "");
    expect(imageDeliveryUrl("asset/alice", "seed-v1")).toBe("/api/images/asset%2Falice/seed-v1");
  });
});

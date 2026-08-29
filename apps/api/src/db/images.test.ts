import { describe, expect, it } from "vitest";

import { imageDeliveryUrl } from "./images";

describe("image delivery URLs", () => {
  it("routes images through the API origin", () => {
    expect(imageDeliveryUrl("asset/alice", "seed-v1")).toBe("/api/images/asset%2Falice/seed-v1");
  });
});

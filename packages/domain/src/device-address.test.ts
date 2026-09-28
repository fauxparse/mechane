import { describe, expect, it } from "vitest";

import { deviceAddress } from "./device-address";

describe("deviceAddress", () => {
  it("uses a live Custom Domain over HTTPS, without a scheme in its text", () => {
    expect(
      deviceAddress(
        { pairingCode: "4QKEW", liveDomain: "vote.knifefight.nz" },
        "https://show.mechane.live",
      ),
    ).toEqual({ url: "https://vote.knifefight.nz/", text: "vote.knifefight.nz" });
  });

  it("falls back to the pairing URL on the canonical Player origin", () => {
    for (const liveDomain of [null, undefined]) {
      expect(
        deviceAddress({ pairingCode: "4QKEW", liveDomain }, "https://show.mechane.live"),
      ).toEqual({ url: "https://show.mechane.live/s/4QKEW", text: "show.mechane.live/s/4QKEW" });
    }
  });

  it("keeps plain HTTP and the Player's dev port for a .localhost domain", () => {
    expect(
      deviceAddress(
        { pairingCode: "4QKEW", liveDomain: "vote.voting.localhost" },
        "http://localhost:5174",
      ),
    ).toEqual({ url: "http://vote.voting.localhost:5174/", text: "vote.voting.localhost:5174" });
  });
});

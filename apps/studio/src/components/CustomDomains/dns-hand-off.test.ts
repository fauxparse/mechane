import { describe, expect, it } from "vitest";

import { LIVE, UNVERIFIED } from "./custom-domain-fixtures";
import { dnsHandOff } from "./custom-domain-model";

describe("dnsHandOff", () => {
  it("carries every record to create, the _mechane proof included", () => {
    const message = dnsHandOff(UNVERIFIED);

    for (const record of UNVERIFIED.records) {
      expect(message).toContain(`${record.type}  ${record.name}  →  ${record.value}`);
    }
    expect(message).toContain("_mechane.screen.knifefight.nz");
  });

  it("includes the pointing record once the domain has one", () => {
    expect(dnsHandOff(LIVE)).toContain("CNAME  vote.knifefight.nz  →  d1d4fc829fe7bc7c");
  });
});

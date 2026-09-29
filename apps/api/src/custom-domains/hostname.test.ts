// The hostname rules (issue #829): normalisation, every refusal class with
// its own code, the ancestor walk blocks and cache tags share, and the one
// live-status predicate. Pure functions, so no Postgres here.
import { describe, expect, it } from "vitest";

import {
  MECHANE_OWNED_ZONES,
  hostnameAndAncestors,
  hostnameRefusalCode,
  isLiveCustomDomainStatus,
  normaliseHostname,
} from "./hostname";

describe("normaliseHostname", () => {
  it("strips case and the trailing dot, and converts to punycode", () => {
    expect(normaliseHostname("Vote.Knifefight.NZ.")).toBe("vote.knifefight.nz");
    expect(normaliseHostname("bücher.example")).toBe("xn--bcher-kva.example");
    expect(normaliseHostname("  vote.knifef1ght.nz ")).toBe("vote.knifef1ght.nz");
  });

  it("returns null for anything that isn't a bare hostname", () => {
    expect(normaliseHostname("")).toBeNull();
    expect(normaliseHostname(".")).toBeNull();
    expect(normaliseHostname("foo..bar")).toBeNull();
    expect(normaliseHostname("not a hostname")).toBeNull();
    expect(normaliseHostname("-leading-hyphen.example")).toBeNull();
    expect(normaliseHostname("under_score.example")).toBeNull();
  });
});

describe("hostnameRefusalCode", () => {
  it("refuses IPv4 and IPv6 addresses with the ip_address code", () => {
    expect(hostnameRefusalCode("192.168.1.1")).toBe("ip_address");
    expect(hostnameRefusalCode("203.0.113.7")).toBe("ip_address");
    expect(hostnameRefusalCode("::1")).toBe("ip_address");
    expect(hostnameRefusalCode("2001:db8::1")).toBe("ip_address");
    expect(hostnameRefusalCode("[2001:db8::1]")).toBe("ip_address");
  });

  it("refuses wildcards with the wildcard code", () => {
    expect(hostnameRefusalCode("*.example.com")).toBe("wildcard");
    expect(hostnameRefusalCode("vote.*.example.com")).toBe("wildcard");
  });

  it("refuses Mechanē's own zones and everything under them", () => {
    expect(hostnameRefusalCode("mechane.live")).toBe("mechane_owned_zone");
    expect(hostnameRefusalCode("mechane.dev")).toBe("mechane_owned_zone");
    expect(hostnameRefusalCode("vote.mechane.live")).toBe("mechane_owned_zone");
    expect(hostnameRefusalCode("a.b.mechane.dev")).toBe("mechane_owned_zone");
    // The zones are one exported list, and only those zones are refused.
    expect([...MECHANE_OWNED_ZONES]).toEqual(["mechane.live", "mechane.dev"]);
    expect(hostnameRefusalCode("mechane.org")).toBeNull();
    expect(hostnameRefusalCode("mechane-live.example.com")).toBeNull();
  });

  it("refuses Public Suffix List entries themselves, not domains under them", () => {
    expect(hostnameRefusalCode("co.nz")).toBe("public_suffix");
    expect(hostnameRefusalCode("com")).toBe("public_suffix");
    // A private-section PSL entry is an entry too.
    expect(hostnameRefusalCode("blogspot.com")).toBe("public_suffix");
    expect(hostnameRefusalCode("vote.co.nz")).toBeNull();
    expect(hostnameRefusalCode("vote.knifef1ght.nz")).toBeNull();
  });

  it("refuses .localhost unless the caller passes allowLocalhost", () => {
    expect(hostnameRefusalCode("voting.localhost")).toBe("localhost");
    expect(hostnameRefusalCode("vote.voting.localhost")).toBe("localhost");
    expect(hostnameRefusalCode("localhost")).toBe("localhost");
    expect(hostnameRefusalCode("voting.localhost", { allowLocalhost: true })).toBeNull();
    expect(hostnameRefusalCode("localhost", { allowLocalhost: true })).toBeNull();
    // Only .localhost is governed by the flag.
    expect(hostnameRefusalCode("vote.example.com", { allowLocalhost: true })).toBeNull();
  });

  it("refuses unnormalisable input with the invalid_hostname code", () => {
    expect(hostnameRefusalCode("")).toBe("invalid_hostname");
    expect(hostnameRefusalCode("   ")).toBe("invalid_hostname");
    expect(hostnameRefusalCode("foo..bar")).toBe("invalid_hostname");
  });
});

describe("hostnameAndAncestors", () => {
  it("lists the hostname then each ancestor, stopping at the registrable domain", () => {
    expect(hostnameAndAncestors("a.b.x.nz")).toEqual(["a.b.x.nz", "b.x.nz", "x.nz"]);
    expect(hostnameAndAncestors("vote.knifef1ght.nz")).toEqual([
      "vote.knifef1ght.nz",
      "knifef1ght.nz",
    ]);
    // Under .nz's second-level rule the registrable domain is three labels.
    expect(hostnameAndAncestors("vote.co.nz")).toEqual(["vote.co.nz"]);
  });

  it("never reaches the bare TLD, and never throws on hostile input", () => {
    expect(hostnameAndAncestors("a.b.example.com")).not.toContain("com");
    expect(hostnameAndAncestors("::1")).toEqual(["::1"]);
    expect(hostnameAndAncestors("Vote.Knifefight.NZ.")).toEqual([
      "vote.knifefight.nz",
      "knifefight.nz",
    ]);
  });
});

describe("isLiveCustomDomainStatus", () => {
  it("counts exactly live and needs_attention as live", () => {
    expect(isLiveCustomDomainStatus("live")).toBe(true);
    // A domain that fails a recheck keeps serving through its grace period.
    expect(isLiveCustomDomainStatus("needs_attention")).toBe(true);
    expect(isLiveCustomDomainStatus("unverified")).toBe(false);
    expect(isLiveCustomDomainStatus("connecting")).toBe(false);
    expect(isLiveCustomDomainStatus("securing")).toBe(false);
    expect(isLiveCustomDomainStatus("revoked")).toBe(false);
  });
});

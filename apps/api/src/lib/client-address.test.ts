import { describe, expect, it } from "vitest";

import { clientAddress } from "./client-address";

const forwardedFor = (value: string) => clientAddress(new Headers({ "X-Forwarded-For": value }));

describe("clientAddress", () => {
  it("takes the entry the nearest proxy wrote, not the ones the client sent", () => {
    expect(forwardedFor("203.0.113.9, 198.51.100.7")).toBe("198.51.100.7");
  });

  it("groups IPv6 clients by /64, however the address is written", () => {
    expect(forwardedFor("2001:DB8:0:12::1")).toBe("2001:db8:0:12::/64");
    expect(forwardedFor("2001:db8:0:12:ffff:ffff:ffff:ffff")).toBe("2001:db8:0:12::/64");
    expect(forwardedFor("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });

  it("keys an IPv4-mapped IPv6 address on its IPv4", () => {
    expect(forwardedFor("::ffff:203.0.113.9")).toBe("203.0.113.9");
  });

  it("has no address without a usable header", () => {
    expect(clientAddress(new Headers())).toBeNull();
    expect(forwardedFor("unknown")).toBeNull();
  });
});

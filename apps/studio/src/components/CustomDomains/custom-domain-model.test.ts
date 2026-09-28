import { describe, expect, it } from "vitest";

import { DEVICES, LIVE, UNBOUND, UNVERIFIED } from "./custom-domain-fixtures";
import { bindConsequence } from "./custom-domain-model";

const [audience, projector] = DEVICES as [(typeof DEVICES)[number], (typeof DEVICES)[number]];

describe("bindConsequence", () => {
  it("reports moving a domain from the Device it opens now", () => {
    expect(bindConsequence([LIVE], LIVE.id, projector)).toEqual({
      moves: LIVE.binding,
      displaces: null,
    });
  });

  it("reports displacing the target Device's existing domain", () => {
    expect(bindConsequence([LIVE, UNBOUND], UNBOUND.id, audience)).toEqual({
      moves: null,
      displaces: LIVE,
    });
  });

  it("disturbs nothing binding a domain to the Device it already opens", () => {
    expect(bindConsequence([LIVE, UNVERIFIED], LIVE.id, audience)).toEqual({
      moves: null,
      displaces: null,
    });
  });

  it("warns that a new domain would displace the Device's existing one", () => {
    expect(bindConsequence([UNVERIFIED], null, projector).displaces).toBe(UNVERIFIED);
  });
});

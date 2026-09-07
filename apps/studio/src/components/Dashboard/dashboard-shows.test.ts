import type { ShowId } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import {
  byLiveThenRecency,
  isFiltering,
  matchesShowFilter,
  type DashboardShow,
} from "./dashboard-shows";

function show(id: string, name: string, updatedAt: string): DashboardShow {
  return { id: id as ShowId, name, createdAt: "2026-01-01T00:00:00.000Z", updatedAt };
}

const voting = show("s_voting", "Voting", "2026-09-07T22:17:00.000Z");
const audience = show("s_audience", "Navigation Audience", "2026-09-07T22:16:00.000Z");
const proof = show("s_proof", "Navigation Proof", "2026-09-07T21:14:00.000Z");

describe("byLiveThenRecency", () => {
  it("orders by recency when nothing is live", () => {
    expect([proof, voting, audience].sort(byLiveThenRecency(new Set())).map((s) => s.name)).toEqual(
      ["Voting", "Navigation Audience", "Navigation Proof"],
    );
  });

  it("gives a live Show the top spot over a more recently updated one", () => {
    // `audience` is live but was updated a minute *before* `voting`, which is
    // the case a plain recency sort gets wrong.
    const ordered = [voting, audience, proof].sort(byLiveThenRecency(new Set(["s_audience"])));
    expect(ordered.map((s) => s.name)).toEqual([
      "Navigation Audience",
      "Voting",
      "Navigation Proof",
    ]);
  });

  it("falls back to recency among several live Shows", () => {
    const ordered = [proof, audience, voting].sort(
      byLiveThenRecency(new Set(["s_audience", "s_voting"])),
    );
    expect(ordered.map((s) => s.name)).toEqual([
      "Voting",
      "Navigation Audience",
      "Navigation Proof",
    ]);
  });
});

describe("matchesShowFilter", () => {
  const noneLive = { liveOnly: false, liveShowIds: new Set<string>() };

  it("matches every Show on a blank query", () => {
    expect(matchesShowFilter(voting, { ...noneLive, query: "   " })).toBe(true);
  });

  it("matches a case-insensitive substring of the name", () => {
    expect(matchesShowFilter(voting, { ...noneLive, query: "OTI" })).toBe(true);
    expect(matchesShowFilter(voting, { ...noneLive, query: "rehearsal" })).toBe(false);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(matchesShowFilter(voting, { ...noneLive, query: "  voting  " })).toBe(true);
  });

  it("excludes Shows with no active Run when live-only is on", () => {
    const filter = { query: "", liveOnly: true, liveShowIds: new Set(["s_audience"]) };
    expect(matchesShowFilter(audience, filter)).toBe(true);
    expect(matchesShowFilter(voting, filter)).toBe(false);
  });

  it("applies the query and the live toggle together", () => {
    const filter = { query: "navigation", liveOnly: true, liveShowIds: new Set(["s_voting"]) };
    // Name matches, but it is not live.
    expect(matchesShowFilter(audience, filter)).toBe(false);
    // Live, but the name does not match.
    expect(matchesShowFilter(voting, filter)).toBe(false);
  });
});

describe("isFiltering", () => {
  it("treats a whitespace-only query as no filter", () => {
    expect(isFiltering({ query: " ", liveOnly: false, liveShowIds: new Set() })).toBe(false);
  });

  it("counts the live toggle on its own", () => {
    expect(isFiltering({ query: "", liveOnly: true, liveShowIds: new Set() })).toBe(true);
  });
});

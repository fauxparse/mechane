import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { elapsedSince, relativeTime } from "./elapsed";

const NOW = new Date("2026-09-08T12:00:00.000Z");

/** `startedAt` for a Run that began `seconds` ago. */
function ago(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("elapsedSince", () => {
  it("counts seconds for the first minute", () => {
    expect(elapsedSince(ago(0))).toBe("0s");
    expect(elapsedSince(ago(45))).toBe("45s");
  });

  it("switches to whole minutes on the minute", () => {
    // The boundary the badge is read across most often.
    expect(elapsedSince(ago(59))).toBe("59s");
    expect(elapsedSince(ago(60))).toBe("1m");
  });

  it("switches to hours and padded minutes on the hour", () => {
    expect(elapsedSince(ago(59 * 60))).toBe("59m");
    expect(elapsedSince(ago(60 * 60))).toBe("1h 00m");
    expect(elapsedSince(ago(125 * 60))).toBe("2h 05m");
  });

  it("reads zero rather than counting backwards from a clock skew", () => {
    // The server minted `startedAt`; a client a few seconds behind it must not
    // render a negative duration.
    expect(elapsedSince(new Date(NOW.getTime() + 5000).toISOString())).toBe("0s");
  });

  it("says nothing for an unparseable timestamp", () => {
    expect(elapsedSince("not a date")).toBe("");
  });
});

describe("relativeTime", () => {
  it("describes recent changes in the largest unit that still fits", () => {
    expect(relativeTime(ago(30))).toBe("30 seconds ago");
    expect(relativeTime(ago(3 * 60))).toBe("3 minutes ago");
    expect(relativeTime(ago(5 * 60 * 60))).toBe("5 hours ago");
  });

  it("uses the calendar wording available for a single unit", () => {
    expect(relativeTime(ago(24 * 60 * 60))).toBe("yesterday");
  });

  it("says nothing for an unparseable timestamp", () => {
    expect(relativeTime("")).toBe("");
  });
});

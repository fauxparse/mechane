import { describe, expect, it } from "vitest";

import { hasUnpublishedChanges, publishState } from "./publish";

const EPOCH = new Date(0).toISOString();
const EARLIER = "2026-08-01T10:00:00.000Z";
const LATER = "2026-08-01T11:00:00.000Z";

describe("publishState", () => {
  it("is empty for a Show that has never been edited or published", () => {
    expect(publishState(EPOCH, EPOCH)).toBe("empty");
  });

  it("has unpublished changes when the draft has never been published", () => {
    expect(publishState(LATER, EPOCH)).toBe("unpublished-changes");
  });

  it("has unpublished changes when the draft moved on after publishing", () => {
    expect(publishState(LATER, EARLIER)).toBe("unpublished-changes");
  });

  it("is published when the published graph is newer than the draft", () => {
    // Publishing reads the draft and then writes the published graph, so
    // this is what a Show looks like the moment after Publish is clicked.
    expect(publishState(EARLIER, LATER)).toBe("published");
  });

  it("counts equal timestamps as published", () => {
    expect(publishState(LATER, LATER)).toBe("published");
  });

  it("accepts Dates as well as ISO strings", () => {
    expect(publishState(new Date(LATER), new Date(EARLIER))).toBe("unpublished-changes");
  });

  it("treats an unparseable timestamp as never", () => {
    expect(publishState("not a date", "not a date")).toBe("empty");
    expect(publishState(LATER, "not a date")).toBe("unpublished-changes");
  });
});

describe("hasUnpublishedChanges", () => {
  it("is true only when the draft is ahead", () => {
    expect(hasUnpublishedChanges("unpublished-changes")).toBe(true);
    expect(hasUnpublishedChanges("published")).toBe(false);
    expect(hasUnpublishedChanges("empty")).toBe(false);
  });
});

import { emptyShowGraph } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import { serializeShowGraph } from "./show-graph";

describe("serializeShowGraph", () => {
  it("always exposes empty interaction collections", () => {
    const serialized = serializeShowGraph({
      ...emptyShowGraph(),
      showId: "show_test",
      state: "published",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      version: 1,
    });

    expect(serialized).toMatchObject({
      cues: [],
      actions: [],
      eventBindings: [],
    });
  });
});

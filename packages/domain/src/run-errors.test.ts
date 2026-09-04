import { describe, expect, it } from "vitest";
import type { RunErrorDetail } from "./run-errors";
import { describeRunError, isRunErrorCategory, RUN_ERROR_CATEGORIES } from "./run-errors";

describe("Run errors", () => {
  it("renders one readable sentence naming the affected configuration", () => {
    expect(describeRunError({ category: "missingSceneCanvas", sceneId: "cabc123" })).toBe(
      'Scene "cabc123" has no published Canvas, so it cannot be displayed.',
    );
    expect(describeRunError({ category: "deviceWithoutFlow", deviceId: "dxyz789" })).toContain(
      'Device "dxyz789"',
    );
    expect(
      describeRunError({
        category: "invalidNavigateAction",
        cueId: "qcue001",
        sceneId: "cabc123",
        actionId: "jact001",
      }),
    ).toBe(
      'Cue "qcue001" on Scene "cabc123" does not lead to a Navigate Action targeting a Scene ' +
        "in the Device's Flow, so the Event went nowhere.",
    );
  });

  it("describes every category without leaking anything but its identifiers", () => {
    const detail: RunErrorDetail = {
      category: "missingSceneCanvas",
      deviceId: "dxyz789",
      sceneId: "cabc123",
      elementId: "eel0001",
      cueId: "qcue001",
      actionId: "jact001",
      eventId: "b0a1c2d3-0000-4000-8000-000000000000",
      publishedGraphVersion: 7,
    };
    for (const category of RUN_ERROR_CATEGORIES) {
      const message = describeRunError({ ...detail, category });
      expect(message.length).toBeGreaterThan(0);
      expect(message).toMatch(/\.$/);
      // The whole point of rendering from stored facts: the only variable
      // content a log line can carry is an identifier the category names.
      for (const quoted of message.match(/"([^"]*)"/g) ?? []) {
        expect(Object.values(detail)).toContain(quoted.slice(1, -1));
      }
    }
  });

  it("names an unidentified thing rather than leaving a gap", () => {
    expect(describeRunError({ category: "deviceWithoutFlow" })).toContain("an unidentified Device");
  });

  it("recognises only its own categories", () => {
    expect(isRunErrorCategory("invalidInteractions")).toBe(true);
    expect(isRunErrorCategory("missingBlock")).toBe(false);
    expect(isRunErrorCategory("")).toBe(false);
  });
});

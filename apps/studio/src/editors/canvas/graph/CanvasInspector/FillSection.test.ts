import { describe, expect, it } from "vitest";

import { gradientForMode, insertedGradientStop } from "./FillSection";

describe("gradientForMode", () => {
  it("preserves existing stops and gradient properties when changing kind", () => {
    const existing = {
      kind: "linear" as const,
      angle: 135,
      stops: [
        { color: "#112233", position: 0 },
        { color: "#445566", position: 0.35 },
        { color: "#778899", position: 1 },
      ],
    };

    expect(gradientForMode("radial", existing)).toEqual({
      ...existing,
      kind: "radial",
    });
  });

  it("uses the default stops when starting a new gradient", () => {
    expect(gradientForMode("linear")).toEqual({
      kind: "linear",
      angle: 0,
      stops: [
        { color: "#000000", position: 0 },
        { color: "#ffffff", position: 1 },
      ],
    });
  });
});

describe("insertedGradientStop", () => {
  it("places a stop halfway between the last two stops and blends their colors", () => {
    expect(
      insertedGradientStop([
        { color: "#000000", position: 0 },
        { color: "#ffffff", position: 1 },
      ]),
    ).toEqual({ color: "#808080", position: 0.5 });
  });

  it("uses the last two stops even when earlier stops exist", () => {
    expect(
      insertedGradientStop([
        { color: "#000000", position: 0 },
        { color: "#112233", position: 0.4 },
        { color: "#334455", position: 1 },
      ]),
    ).toEqual({ color: "#223344", position: 0.7 });
  });
});

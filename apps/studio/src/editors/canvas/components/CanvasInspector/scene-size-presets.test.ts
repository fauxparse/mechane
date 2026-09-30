import type { FrameElement } from "@mechane/domain/canvas";
import { describe, expect, it } from "vitest";

import {
  SCENE_SIZE_PRESETS,
  matchingSceneSizePreset,
  sceneSizePresetProperties,
} from "./scene-size-presets";

const fullHd = SCENE_SIZE_PRESETS.find((preset) => preset.id === "full-hd");
if (!fullHd) throw new Error("The Full HD preset is missing.");

const root = (sizing: FrameElement["sizing"], layout?: FrameElement["layout"]): FrameElement => ({
  id: "root",
  type: "frame",
  sizing,
  ...(layout ? { layout } : {}),
});

describe("Scene size presets", () => {
  it("fixes hugging and fixed axes at the preset, replacing any Formula", () => {
    const properties = sceneSizePresetProperties(
      root({
        width: { mode: "hug" },
        height: {
          mode: "fixed",
          value: { kind: "formula", formula: "Rows * 40", fallback: 200, unit: "px" },
        },
      }),
      fullHd,
    );
    expect(properties).toEqual({
      sizing: {
        width: { mode: "fixed", value: 1920 },
        height: { mode: "fixed", value: 1080 },
      },
    });
  });

  it("keeps filled axes filling and sets their minimum instead", () => {
    const properties = sceneSizePresetProperties(
      root({ width: { mode: "fill" }, height: { mode: "fixed", value: 400 }, minWidth: 320 }),
      fullHd,
    );
    expect(properties).toEqual({
      sizing: {
        width: { mode: "fill" },
        minWidth: 1920,
        height: { mode: "fixed", value: 1080 },
      },
    });
  });

  it("moves an aspect-ratio lock to the preset's ratio", () => {
    const properties = sceneSizePresetProperties(
      root(
        { width: { mode: "fixed", value: 400 }, height: { mode: "fixed", value: 400 } },
        { rotation: 0, aspectRatio: { ratio: 1, driver: "height" } },
      ),
      fullHd,
    );
    expect(properties.layout).toEqual({
      rotation: 0,
      aspectRatio: { ratio: 1920 / 1080, driver: "height" },
    });
  });

  it("recognises a preset through fixed pixels and filled minimums alike", () => {
    expect(
      matchingSceneSizePreset({
        width: { mode: "fill" },
        minWidth: { value: 1920, unit: "px" },
        height: { mode: "fixed", value: 1080 },
      }),
    ).toBe(fullHd);
  });

  it("reads a size no preset has, or one that isn't literal pixels, as custom", () => {
    expect(
      matchingSceneSizePreset({
        width: { mode: "fixed", value: 1080 },
        height: { mode: "fixed", value: 1920 },
      }),
    ).toBeNull();
    expect(
      matchingSceneSizePreset({
        width: { mode: "fixed", value: { value: 1920, unit: "%" } },
        height: { mode: "fixed", value: 1080 },
      }),
    ).toBeNull();
    expect(
      matchingSceneSizePreset({ width: { mode: "hug" }, height: { mode: "fixed", value: 1080 } }),
    ).toBeNull();
  });
});

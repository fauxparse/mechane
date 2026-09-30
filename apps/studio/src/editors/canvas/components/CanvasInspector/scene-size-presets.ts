import type { Element, ElementSizing } from "@mechane/domain/canvas";

import { authoredRootPixels } from "../../data/canvas-workspace";

export interface SceneSizePreset {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

export interface SceneSizePresetGroup {
  readonly label: string;
  readonly presets: readonly SceneSizePreset[];
}

/** Common Device sizes in CSS pixels, which is what a Scene root's size is authored in. */
export const SCENE_SIZE_PRESET_GROUPS: readonly SceneSizePresetGroup[] = [
  {
    label: "Screen",
    presets: [
      { id: "full-hd", label: "Full HD", width: 1920, height: 1080 },
      { id: "hd", label: "HD", width: 1280, height: 720 },
      { id: "4k-uhd", label: "4K UHD", width: 3840, height: 2160 },
    ],
  },
  {
    label: "Phone",
    presets: [
      { id: "iphone", label: "iPhone", width: 393, height: 852 },
      { id: "iphone-pro-max", label: "iPhone Pro Max", width: 440, height: 956 },
      { id: "iphone-se", label: "iPhone SE", width: 375, height: 667 },
      { id: "android", label: "Android", width: 412, height: 915 },
      { id: "android-compact", label: "Android compact", width: 360, height: 800 },
    ],
  },
  {
    label: "Tablet",
    presets: [
      { id: "ipad", label: "iPad", width: 820, height: 1180 },
      { id: "ipad-pro", label: "iPad Pro", width: 1032, height: 1376 },
      { id: "android-tablet", label: "Android tablet", width: 800, height: 1280 },
    ],
  },
];

export const SCENE_SIZE_PRESETS: readonly SceneSizePreset[] = SCENE_SIZE_PRESET_GROUPS.flatMap(
  (group) => group.presets,
);

/** The preset a Scene root is authored at, or null for a custom size. */
export function matchingSceneSizePreset(sizing: ElementSizing | undefined): SceneSizePreset | null {
  const width = authoredRootPixels(sizing, "width", "scene");
  const height = authoredRootPixels(sizing, "height", "scene");
  return (
    SCENE_SIZE_PRESETS.find((preset) => preset.width === width && preset.height === height) ?? null
  );
}

/**
 * The properties that author a Scene root at a preset. A filled axis keeps filling the Player
 * viewport and takes the preset as its minimum; any other axis becomes a fixed pixel size. An
 * aspect-ratio lock follows the preset, since otherwise it would contradict the new size.
 */
export function sceneSizePresetProperties(
  root: Element,
  preset: SceneSizePreset,
): Record<string, unknown> {
  const sizing: ElementSizing = { ...root.sizing };
  for (const axis of ["width", "height"] as const) {
    if (sizing[axis]?.mode === "fill") {
      sizing[axis === "width" ? "minWidth" : "minHeight"] = preset[axis];
    } else {
      sizing[axis] = { mode: "fixed", value: preset[axis] };
    }
  }
  const lock = root.layout?.aspectRatio;
  if (!lock) return { sizing };
  return {
    sizing,
    layout: { ...root.layout, aspectRatio: { ...lock, ratio: preset.width / preset.height } },
  };
}

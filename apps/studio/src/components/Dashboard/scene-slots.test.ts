import { describe, expect, it } from "vitest";

import { sceneSlots } from "./scene-slots";

const scenes = ["red", "green", "blue", "amber", "violet", "grey"];

describe("sceneSlots", () => {
  it("shows everything when there is room to spare", () => {
    expect(sceneSlots(scenes.slice(0, 3), 4)).toEqual({
      shown: ["red", "green", "blue"],
      hidden: 0,
    });
  });

  it("shows every Scene when the count exactly fills the slots", () => {
    // The boundary that matters: four Scenes in four slots needs no counter,
    // so none of them are sacrificed to make room for one.
    expect(sceneSlots(scenes.slice(0, 4), 4)).toEqual({
      shown: ["red", "green", "blue", "amber"],
      hidden: 0,
    });
  });

  it("gives the last slot to the counter as soon as one Scene overflows", () => {
    expect(sceneSlots(scenes.slice(0, 5), 4)).toEqual({
      shown: ["red", "green", "blue"],
      hidden: 2,
    });
  });

  it("counts every hidden Scene, however many there are", () => {
    expect(sceneSlots(scenes, 4)).toEqual({ shown: ["red", "green", "blue"], hidden: 3 });
  });

  it("has nothing to show and nothing to hide for an empty Show", () => {
    expect(sceneSlots([], 4)).toEqual({ shown: [], hidden: 0 });
  });

  it("degenerates to a bare counter rather than a negative slice", () => {
    expect(sceneSlots(scenes, 1)).toEqual({ shown: [], hidden: 6 });
  });
});

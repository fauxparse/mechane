// How many Scene thumbnails a strip shows, and how many it admits to hiding.
//
// The strip occupies a fixed number of slots rather than growing, so a Show
// with twenty Scenes cannot push the band's actions off the screen. The subtle
// part, and the reason this is a function rather than a `slice` at the call
// site: when the Scenes do not fit, the overflow counter takes the *last*
// slot instead of being appended after them. Five Scenes in four slots is
// therefore three thumbnails and "+2", not four and "+1".

export interface SceneSlots<T> {
  /** The Scenes to render, in order. */
  readonly shown: readonly T[];
  /** How many are not rendered; zero when everything fits. */
  readonly hidden: number;
}

export function sceneSlots<T>(scenes: readonly T[], slots: number): SceneSlots<T> {
  // Exactly `slots` Scenes still fit, because no counter is needed to say so.
  if (scenes.length <= slots) return { shown: scenes, hidden: 0 };
  const shown = scenes.slice(0, Math.max(0, slots - 1));
  return { shown, hidden: scenes.length - shown.length };
}

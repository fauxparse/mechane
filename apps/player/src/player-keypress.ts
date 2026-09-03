// The Player's keyboard entry point (#522).
//
// Tap reaches dispatch through CanvasRenderer's onElementTap. A keypress has
// no Element under it and no renderer involvement, so it needs its own way in
// — but it reaches the *same* two dispatch owners: per-connection Devices
// resolve locally in ./player-navigation, Shared Devices submit to the server.

import { bindableKeyFor } from "@mechane/domain";
import { useEffect } from "react";

/**
 * Whether a focused control owns the keyboard right now.
 *
 * Deliberately *not* the Studio's `focus-context.ts`, which looks like the
 * same function and answers the opposite question. The Studio suppresses its
 * shortcuts for a focused button, because an inspector control's arrow keys
 * belong to that control. Here a focused button must NOT suppress: the only
 * buttons a Player shows are its own chrome, and a tech who clicked "Use this
 * tab instead" would otherwise lose every shortcut in the show.
 *
 * Sharing one implementation would guarantee that a change made for one app
 * silently breaks the other.
 */
function keyboardIsClaimed(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  return active.closest("input, textarea, select, [contenteditable]") !== null;
}

/**
 * The key a keydown stands for, or `null` when it cannot drive a Show.
 *
 * Pure, and separated from the listener, because the guards are where the
 * platform edge cases live — Firefox's `key: "Process"` during IME, the first
 * keydown of a composition arriving with `isComposing: false`, macOS Option
 * behaving as AltGr — and those deserve tests with synthetic events rather
 * than being reached through a rendered tree.
 */
export function keypressObservationFor(
  event: KeyboardEvent,
  isClaimed: () => boolean = keyboardIsClaimed,
): string | null {
  if (isClaimed()) return null;
  return bindableKeyFor(event);
}

/**
 * Calls `onKeyPress` for each bindable keydown while `enabled`.
 *
 * `onKeyPress` returns whether the key matched a Binding, so that only a key
 * that actually drove the Show suppresses the browser's default. A projector
 * Scene scrolling because someone pressed Space is a visible on-stage failure;
 * a Player that swallows every key is a different one.
 */
export function usePlayerKeypress(enabled: boolean, onKeyPress: (key: string) => boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = keypressObservationFor(event);
      if (key === null) return;
      if (onKeyPress(key)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onKeyPress]);
}

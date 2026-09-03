// The bindable key vocabulary for `keypress` Event Bindings (#519).
//
// One module because three layers need the same answers and none of them
// should own it: `assertValidInteractions` validates a stored key, the Studio
// capture control decides what a keydown may become, and the Player guards
// dispatch. Two copies of "is this key bindable?" is how the authoring UI ends
// up offering a key the domain then rejects.
//
// Bindings identify a key by its *meaning* — `KeyboardEvent.key`, which is
// layout-aware — because "press R for Red" is a meaning, not a physical
// position. The accepted cost is that a binding is portable as a glyph, not as
// a key: a Show authored on US QWERTY binding `?` is unusable on a layout
// where `?` is not shift-reachable.

/**
 * Keys that produce no character but are still bindable. `Space` is here
 * rather than stored as its literal U+0020 because a raw space is one careless
 * `trim()` or falsiness check away from reading as an unset key — and an unset
 * key is a meaningful state (#517).
 */
export const NAMED_KEYS = [
  "Space",
  "Tab",
  "Enter",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
] as const;

export type NamedKey = (typeof NAMED_KEYS)[number];

const NAMED_KEY_SET: ReadonlySet<string> = new Set(NAMED_KEYS);

/** `KeyboardEvent.key` values that identify no key and must never be stored. */
const UNBINDABLE_KEYS: ReadonlySet<string> = new Set(["Dead", "Process", "Unidentified", "Escape"]);

/** Modifier keydowns, which arrive on their own before the key they modify. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  "Shift",
  "Control",
  "Alt",
  "AltGraph",
  "Meta",
  "CapsLock",
]);

/** C0 and C1 control ranges, which are single "characters" but not printable. */
function isControlCharacter(key: string): boolean {
  const code = key.codePointAt(0);
  if (code === undefined) return true;
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

function isSingleCharacter(key: string): boolean {
  return [...key].length === 1;
}

/**
 * Whether `key` is a valid stored key: any single printable character, or one
 * of the named keys.
 *
 * The character half is a predicate rather than an enumerated list so that a
 * Cyrillic or Arabic layout can bind its own letters — UI Events reports the
 * same physical key as `"v"` on a US layout and `"ر"` on an Arabic one.
 */
export function isBindableKey(key: string): boolean {
  if (NAMED_KEY_SET.has(key)) return true;
  // A raw U+0020 is excluded even though it is printable: Space has a name in
  // this vocabulary, and admitting both forms would let hand-edited data store
  // a key that every capture path normalises away from, and so never matches.
  if (key === " ") return false;
  return isSingleCharacter(key) && !isControlCharacter(key);
}

/**
 * The stored form of a captured key. Single characters casefold because both
 * Shift *and* CapsLock change the case a browser reports, so the captured
 * string cannot be trusted to say whether the author meant upper or lower.
 *
 * `toLowerCase` rather than `toLocaleLowerCase`: a locale-sensitive fold would
 * let a Turkish author store a key no other browser can match.
 */
export function normalizeKey(key: string): string {
  return isSingleCharacter(key) ? key.toLowerCase() : key;
}

/** The keydown fields `bindableKeyFor` reads, so tests need no real DOM event. */
export interface KeypressCandidate {
  key: string;
  repeat: boolean;
  isComposing: boolean;
  keyCode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  getModifierState(key: string): boolean;
}

/**
 * The stored key for a keydown, or `null` when the event cannot become a
 * binding. Pure so the Studio capture control and the Player dispatch guard
 * can be tested against synthetic events rather than through a rendered tree.
 *
 * Shift and CapsLock are deliberately permitted: they are *glyph* modifiers,
 * so shift-reachable specials arrive as the shifted glyph and excluding them
 * would make `@` and `?` unbindable. Alt is rejected because macOS treats
 * Option as AltGr (Option+G yields `©`) while plain Windows/Linux Alt leaves
 * the glyph untouched, so `Alt+R` and `R` would be indistinguishable.
 */
export function bindableKeyFor(event: KeypressCandidate): string | null {
  if (event.repeat) return null;
  // 229 is VK_PROCESSKEY. Not redundant with `isComposing`, which is false on
  // the first keydown of a composition sequence.
  if (event.isComposing || event.keyCode === 229) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.getModifierState("AltGraph")) return null;
  if (MODIFIER_KEYS.has(event.key) || UNBINDABLE_KEYS.has(event.key)) return null;
  const key = event.key === " " ? "Space" : event.key;
  if (!isBindableKey(key)) return null;
  return normalizeKey(key);
}

const DISPLAY_NAMES: Readonly<Record<NamedKey, string>> = {
  Space: "Space",
  Tab: "Tab",
  Enter: "Enter",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
};

const ACCESSIBLE_NAMES: Readonly<Record<NamedKey, string>> = {
  Space: "Space",
  Tab: "Tab",
  Enter: "Enter",
  ArrowLeft: "Left arrow",
  ArrowRight: "Right arrow",
  ArrowUp: "Up arrow",
  ArrowDown: "Down arrow",
};

function namedKey(key: string): NamedKey | null {
  return NAMED_KEY_SET.has(key) ? (key as NamedKey) : null;
}

/**
 * What an author sees on the key. Letters uppercase because that is what is
 * printed on the keycap; arrows as glyphs, which is the convention every
 * desktop platform uses in menus.
 *
 * `Enter` is deliberately not platform-split to `Return` on macOS: one Show is
 * authored once and handed to a tech who may be on the other platform, and a
 * label whose identity changes by viewer is worse than one mildly wrong.
 */
export function keyDisplayName(key: string): string {
  const named = namedKey(key);
  if (named) return DISPLAY_NAMES[named];
  return isSingleCharacter(key) ? key.toUpperCase() : key;
}

/** What a screen reader says: `←` alone reads poorly, "Left arrow" does not. */
export function keyAccessibleName(key: string): string {
  const named = namedKey(key);
  if (named) return ACCESSIBLE_NAMES[named];
  return isSingleCharacter(key) ? key.toUpperCase() : key;
}

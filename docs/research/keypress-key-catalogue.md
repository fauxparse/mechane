# The bindable key catalogue: what the browser actually reports

Research for [#518](https://github.com/fauxparse/mechane/issues/518), part of map [#516](https://github.com/fauxparse/mechane/issues/516); input to [#514](https://github.com/fauxparse/mechane/issues/514) and [#519](https://github.com/fauxparse/mechane/issues/519).
Date: 2026-09-03. All claims cited to primary sources (W3C UI Events and UI Events KeyboardEvent key values specs, MDN first-party API docs, WebKit/Chromium/Gecko source, Microsoft and Apple platform documentation).

## The question

#514 wants a Keypress event whose parameter is "any unmodified (case-insensitive, no Cmd or Ctrl modifiers, but special characters only reachable with shift are okay) keyboard key, including arrow keys, space, tab, and enter." What does the browser actually deliver for that set, what is stable across layouts and platforms, and what must the capture UI refuse?

## Headline findings

1. **`keypress` genuinely cannot serve this feature.** The spec is unambiguous: it fires "if and only if that key normally produces a character value", which excludes Tab and the arrow keys, and it "MUST NOT be fired when using an input method editor". `keydown` is the only option. #514's premise holds.
2. **Bind on `key`, not `code`.** `key` is the layout-aware _meaning_ — which is exactly what "press `R` to go to Red" means. `code` is the physical position and would break the demo on any non-QWERTY layout.
3. **`key` is not a stable identity across layouts.** The same binding string means "whatever key produces this glyph on the player's keyboard". That is the right semantics for this feature, but it means a Show authored on a US layout and played on an AZERTY layout binds a _different physical key_, and a shift-reachable special may not be reachable at all.
4. **Shift is a _glyph_ modifier on every platform**: Shift+2 arrives as `key: "@"` (US) or `"\""` (UK), with `shiftKey: true`. So "shift-reachable specials are okay" costs nothing extra — but the modifier guard must **allow** `shiftKey`, and must allow `CapsLock` too.
5. **macOS Option is also a glyph modifier**, treated as AltGr by both WebKit and Chromium: Option+G arrives as `key: "©"` with `altKey: true`. Windows/Linux plain `Alt` is not. Recommendation: reject `altKey` at capture time.
6. **Three `key` values must never be stored**: `"Dead"`, `"Process"` (Firefox's IME sentinel), and `"Unidentified"`. Guard with `isComposing` and `keyCode === 229` as well.
7. **Case-insensitivity must be implemented by casefolding single-character keys**, because both Shift _and_ CapsLock flip the reported case.

---

## 1. `key` values for the target set

### Named (non-printing) keys

| Key            | `KeyboardEvent.key`           |
| -------------- | ----------------------------- |
| Enter / Return | `"Enter"`                     |
| Tab            | `"Tab"`                       |
| Space bar      | `" "` (U+0020)                |
| Left arrow     | `"ArrowLeft"`                 |
| Right arrow    | `"ArrowRight"`                |
| Up arrow       | `"ArrowUp"`                   |
| Down arrow     | `"ArrowDown"`                 |
| Escape         | `"Escape"` (excluded by #514) |

Source: [MDN, Key Values for Keyboard Events](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values); [UI Events KeyboardEvent key values](https://w3c.github.io/uievents-key/), which defines Enter as "The `Enter` or `↵` key, to activate current selection or accept current input" and Tab as "The Horizontal Tabulation `Tab` key."

Two legacy values are dead in current browsers but worth knowing when reading old code: "Older browsers may return `"Spacebar"` instead of `" "` for the Space Bar key. Firefox did so until version 37", and "Edge (16 and earlier) and Firefox (36 and earlier) use `"Left"`, `"Right"`, `"Up"`, and `"Down"`" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values)). Neither needs supporting.

**Note the Space trap.** `" "` is a single space character, not a name. Anything that trims, that treats empty-ish strings as unset, or that round-trips through a URL or form field will silently lose it. ARIA's convention for the same key is the string `"Space"` (see §5), which is a reasonable storage form if `" "` proves fragile — but then the capture path needs an explicit translation both ways.

### Character keys, and how they vary by layout

The spec defines the character case as: "A key string that corresponds to the character typed by the user, taking into account the user's current locale setting, modifier state, and any system-level keyboard mapping overrides that are in effect" ([uievents-key §2.2](https://w3c.github.io/uievents-key/)). And explicitly: "the `key` value for a particular key will differ based on the user's current locale setting."

UI Events gives the concrete illustration for the single-quote key ([§4.2.3 code Examples](https://w3c.github.io/uievents/#code-examples)):

| Layout   | `key`    | `code`    |
| -------- | -------- | --------- |
| US       | `"'"`    | `"Quote"` |
| Japanese | `":"`    | `"Quote"` |
| US Intl  | `"Dead"` | `"Quote"` |

…and for a letter key with a non-Latin layout ([§4.3.1](https://w3c.github.io/uievents/#keys-modifiers)): the same physical key reports `key: "v"` on a US layout and `key: "ر"` (Arabic Letter Reh) on an Arabic layout. The spec's own conclusion: "The value in the keydown and keyup events varies based on the current keyboard layout in effect when the key is pressed… To identify these events as coming from the same physical key, you will need to make use of the `code` attribute."

That trade-off is the crux of the design decision for #519:

- **`key`** — "the meaning of the key being pressed, taking into account the current keyboard layout (and IME; dead keys are given a unique key value). Example use case: Detecting modified keys or bare modifier keys (e.g., to perform an action in response to a keyboard shortcut)."
- **`code`** — "the key that was pressed by the user, without any layout modifications applied. Example use case: Detecting WASD keys… or trapping all keys."

([UI Events §4.2.2, The Relationship Between `key` and `code`](https://w3c.github.io/uievents/#code-key-relationship).)

The navigation demo in #514 binds "the first letter of a colour". That is a _meaning_, so `key` is correct. The cost is accepted, not avoided: a binding is portable as a glyph, not as a physical position.

### Shift-reachable specials

Shift _is_ applied before `key` is computed, on every platform. UI Events §4.3.1 gives the event table for Shift+Q on a US layout: `keydown` `key: "Shift"`, then `keydown` `key: "Q"` with `shiftKey` true. MDN puts it plainly for a non-letter: "the `key` property value for the event is set to the string `@` for the U.S keyboard type and `"` for the UK keyboard type, because of the active modifier `shift` key" ([MDN, `KeyboardEvent.key`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key)).

So `@`, `?`, `!` etc. arrive as themselves. Two consequences:

- The "no modifiers" rule in #514 must be read as **no `ctrlKey`, no `metaKey`** — `shiftKey` has to be permitted, or every shift-reachable special is unbindable.
- There is a **release-order artefact**: if Shift is released before the character key, the `keyup` reports the _unshifted_ value. UI Events §4.3.1 tabulates exactly this: `keydown "Q"` … `keyup "Shift"` … `keyup "q"`. Capture on `keydown` only and this never bites.

Microsoft's style guide independently documents why shifted glyphs are not layout-portable, and it is the sharpest statement of the constraint found anywhere: "For example, the `?` and `/` characters aren't shifted keys on every keyboard" ([Microsoft Writing Style Guide, Keys and keyboard shortcuts](https://learn.microsoft.com/en-us/style-guide/a-z-word-list-term-collections/term-collections/keys-keyboard-shortcuts)).

### CapsLock also changes the reported case

`CapsLock` is a glyph modifier alongside Shift (see §4). With CapsLock on, an unshifted `b` reports `key: "B"`. This is the reason case-insensitivity must be implemented as casefolding rather than by trusting the captured string.

---

## 2. Keys reachable via `keydown` but not `keypress`

The normative text ([UI Events §8.3.1.1, `keypress`](https://w3c.github.io/uievents/#event-type-keypress)):

> If supported by a user agent, this event MUST be dispatched when a key is pressed down, **if and only if that key normally produces a character value**. […] This event type MUST be generated after the key mapping. **It MUST NOT be fired when using an input method editor.** […] Authors SHOULD use the `beforeinput` event instead of the `keypress` event.
>
> The `keypress` event is traditionally associated with detecting a character value rather than a physical key, and might not be available on all keys in some configurations.
>
> The `keypress` event type is defined in this specification for reference and completeness, but this specification **deprecates the use of this event type**.

Contrast `keydown` ([§3.5.6.2 note](https://w3c.github.io/uievents/#event-type-keyup)): "The `keydown` and `keyup` events are traditionally associated with detecting **any** key, not just those which produce a character value."

MDN concurs: "the `keypress` event is fired when a letter, number, punctuation, or symbol key is pressed, or else when the Enter key is pressed… Otherwise, when a modifier key such as the Alt, Shift, Ctrl, Meta, Esc, or Option key is pressed in isolation, the `keypress` event is _not_ fired." Warning: "Since this event has been deprecated, you should use `beforeinput` or `keydown` instead." ([MDN, `keypress` event](https://developer.mozilla.org/en-US/docs/Web/API/Element/keypress_event).)

**Reachable on `keydown`, unreachable on `keypress`, from #514's requested set:**

| Key                                                  | `keypress`? | Why                                                                         |
| ---------------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| `ArrowLeft` / `ArrowRight` / `ArrowUp` / `ArrowDown` | ✗           | produce no character value                                                  |
| `Tab`                                                | ✗           | produces no character value (its default action is a focus shift, not text) |
| `Escape`                                             | ✗           | produces no character value (excluded by #514 anyway)                       |
| `Enter`                                              | ✓           | historically dispatched, and MDN documents it as an explicit exception      |
| `" "` (Space)                                        | ✓           | produces U+0020                                                             |
| alphanumerics, shift-reachable specials              | ✓           | produce character values                                                    |

Three of the four categories #514 names outright (arrows, Tab) are impossible on `keypress`. The premise is confirmed, and it is a spec-level impossibility, not a browser quirk.

One further nail: `keypress` is specified with `KeyboardEvent.repeat` pinned to `false` in its trusted-event context table, so it also could not distinguish held keys.

---

## 3. `repeat`, dead keys, and IME composition

### `event.repeat`

Definition ([UI Events §3.5.6.1, `keydown` trusted context](https://w3c.github.io/uievents/#event-type-keydown)): "`KeyboardEvent.repeat`: `true` if a key has been depressed long enough to trigger key repetition, otherwise `false`". And in the interface definition: "true if the key has been pressed in a sustained manner. Holding down a key MUST result in the repeating the events `keydown`, `beforeinput`, `input` in this order, **at a rate determined by the system configuration**."

Implications for #514:

- **The capture input must ignore `repeat: true` events.** A user resting on a key while the input is focused would otherwise re-assign the same key repeatedly (harmless) — but more importantly the rate is OS-configured and unbounded from the app's point of view.
- **Firing policy is a product decision, not a platform one.** Repeats arrive as ordinary `keydown` events. If a held `R` should navigate to Red once, filter `event.repeat`; if it should retrigger, don't. Recommend filtering, since a Keypress event triggering a scene navigation at the OS auto-repeat rate is a footgun.

### Dead keys

The full model ([UI Events §4.3.2, Dead keys](https://w3c.github.io/uievents/#keys-dead)):

> The dead keys (across all keyboard layouts and mappings) are represented by the key value `Dead`. In response to any dead key press, composition events must be dispatched by the user agent and the `compositionupdate` event's `data` value must be the character value of the current state of the dead key combining sequence.

> The MacOS and Linux operating systems use input methods to process dead keys.

The spec's worked sequence for typing `ê` on a French layout:

| #   | Event               | `key`    | `isComposing` | `data` |
| --- | ------------------- | -------- | ------------- | ------ |
| 1   | `keydown`           | `"Dead"` | `false`       | —      |
| 2   | `compositionstart`  | —        | —             | `""`   |
| 3   | `compositionupdate` | —        | —             | U+0302 |
| 4   | `keyup`             | `"Dead"` | `true`        | —      |
| 5   | `keydown`           | `"ê"`    | `true`        | —      |
| 6   | `compositionupdate` | —        | —             | `"ê"`  |
| 7   | `compositionend`    | —        | —             | `"ê"`  |
| 8   | `keyup`             | `"e"`    | `false`       | —      |

Note step 5: the spec warns "the key value (assuming the event is not suppressed) will **not** be `"e"`… because the value delivered to the user agent will already be modified by the dead key operation."

Two things follow. `"Dead"` must be rejected at capture — it identifies no key (MDN: "If pressed by itself, it doesn't generate a character"; to disambiguate you would have to read the associated `compositionupdate`'s `data`). And on a US-International or French layout, keys that are plain punctuation elsewhere are simply unbindable — the `'` key reports `"Dead"` on US Intl (§1 table above).

WebKit's implementation makes the mechanism concrete — `characters` returns an empty string for a dead key, and that empty string is what becomes `"Dead"` ([`PlatformEventFactoryMac.mm`, `keyForKeyEvent`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/mac/PlatformEventFactoryMac.mm)):

```objc
// characters / charactersIgnoringModifiers return an empty string for dead keys.
if (!length)
    return "Dead"_s;
```

### IME composition, `isComposing`, and keyCode 229

`isComposing` is "`true` if the key event occurs as part of a composition session, i.e., after a `compositionstart` event and before the corresponding `compositionend` event" ([UI Events §3.5.1.1](https://w3c.github.io/uievents/#idl-keyboardevent); [MDN](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing)).

The 229 sentinel is normative, in the legacy-key algorithm ([UI Events §7.3.1, How to determine `keyCode` for `keydown` and `keyup` events](https://w3c.github.io/uievents/#determine-keydown-keyup-keyCode)):

> 1. Read the virtual key code from the operating system's event information, if such information is available.
> 2. **If an Input Method Editor is processing key input and the event is `keydown`, return 229.**

229 is `0xE5` = `VK_PROCESSKEY`, documented by Microsoft as "IME PROCESS key" ([Virtual-Key Codes, Winuser.h](https://learn.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes)).

**Browsers disagree about what `key` says during composition, and this matters.** Gecko substitutes a sentinel key _name_ as well as the keyCode ([`widget/cocoa/TextInputHandler.mm`](https://github.com/mozilla/gecko-dev/blob/master/widget/cocoa/TextInputHandler.mm)):

```objc
aKeyEvent.mKeyCode = isProcessedByIME ? NS_VK_PROCESSKEY : ComputeGeckoKeyCode(...);
…
if (isProcessedByIME) {
  aKeyEvent.mKeyNameIndex = KEY_NAME_INDEX_Process;
}
```

`Process` is a real UI Events key name ([`dom/events/KeyNameList.h`](https://github.com/mozilla/gecko-dev/blob/master/dom/events/KeyNameList.h)), so **Firefox can deliver `key: "Process"`** where Chromium delivers the underlying character with `keyCode` 229. Both must be rejected.

There is also precedent for browsers _fabricating_ keydowns around composition. Firefox bug [1529467](https://bugzilla.mozilla.org/show_bug.cgi?id=1529467) — arrow-key `keydown` not firing during Hangul composition on macOS — was fixed by dispatching synthetic `keydown` events after composition ends, with the explicit rationale: "Dispatching a fake `keydown` event for this purpose does not conform to UI Events… However, Chrome dispatches fake `keydown` events intentionally. Therefore, we should follow this hacky behavior."

**Guard, at both capture and dispatch:**

```ts
if (event.isComposing || event.keyCode === 229) return;
if (event.key === "Dead" || event.key === "Process" || event.key === "Unidentified") return;
```

The `keyCode === 229` check is not redundant with `isComposing`: the first `keydown` of a composition sequence carries `isComposing: false` (step 1 of the dead-key table above, and the same holds for IME) while already being IME-processed.

---

## 4. Modifier state: macOS vs Windows/Linux

### The spec algorithm

`key` is computed by this algorithm ([uievents-key §2.2.1, Selecting key attribute values](https://w3c.github.io/uievents-key/#selecting-key-attribute-values)):

> 1. Let `key` be a DOMString initially set to `"Unidentified"`.
> 2. If there exists an appropriate named key attribute value for this key event, then set `key` to that named key attribute value.
> 3. Else, if the key event generates a valid key string, then set `key` to that key string value.
> 4. Else, if the key event has any modifier keys **other than glyph modifier keys**, then set `key` to the key string that would have been generated by this event if it had been typed with all modifier keys removed except for glyph modifier keys.
> 5. Return `key` as the key attribute value for this key event.

And the definition that everything hangs on:

> A **glyph modifier key** is any of the following modifier keys: `Shift`, `CapsLock` or `AltGr`.

So Shift and CapsLock _change_ `key`; Control and Meta do not (step 4 strips them and re-derives the unmodified glyph — which is why Ctrl+V reports `key: "v"`, as UI Events §4.3.1 tabulates).

### macOS: Option is AltGr

Both engines classify Option as a glyph modifier. Chromium states it in a constant ([`ui/events/keycodes/keyboard_code_conversion_mac.mm`](https://github.com/chromium/chromium/blob/main/ui/events/keycodes/keyboard_code_conversion_mac.mm)):

```cpp
// A glyph modifier key is any of the following modifier keys: Shift, CapsLock
// or AltGr (Option for macOS). These keys may, when applied, cause a
// character-key to generate a different character.
//
// See https://w3c.github.io/uievents-key/#selecting-key-attribute-values.
constexpr int kGlyphModifiers = NSEventModifierFlagShift |
                                NSEventModifierFlagCapsLock |
                                NSEventModifierFlagOption;
```

WebKit reaches the same place from the other direction: it uses AppKit's `characters` (which _has_ Option applied) unless Control is held, in which case it falls back to `charactersIgnoringModifiers` ([`PlatformEventFactoryMac.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/mac/PlatformEventFactoryMac.mm)):

```objc
bool isControlDown = ([event modifierFlags] & NSEventModifierFlagControl);
RetainPtr<NSString> string = isControlDown ? [event charactersIgnoringModifiers] : [event characters];
```

**Net effect on macOS: Option+G arrives as `key: "©"` with `altKey: true`; Option+E arrives as `key: "Dead"`.** The alternate glyph is what you get, not the base letter.

### Windows/Linux: plain Alt is not a glyph modifier, but AltGr is — and it may masquerade as Ctrl+Alt

Plain `Alt` on Windows/Linux falls to step 4: `key` reverts to the unmodified glyph. AltGr does not — it is a level-3 shift ([uievents-key §3.2](https://w3c.github.io/uievents-key/#keys-modifier): `"AltGraph"` enables "the ISO Level 3 shift modifier (the standard `Shift` key is the level 2 modifier)").

The complication ([UI Events §4.3.1, Modifier keys](https://w3c.github.io/uievents/#keys-modifiers)):

> Some operating systems simulate the `AltGraph` modifier key with the combination of the `Alt` and `Control` modifier keys. Implementations are encouraged to use the `AltGraph` modifier key.

So on some Windows configurations an AltGr-produced glyph arrives with **both `ctrlKey` and `altKey` true**. A naive `if (event.ctrlKey) return;` guard silently makes a chunk of the AltGr layer unbindable for those users. This is a known cost, not a bug to fix — it is unavoidable without `getModifierState("AltGraph")`, which is available and _is_ the spec's preferred signal.

The same section also documents the left/right asymmetry that makes `key`-based Alt detection layout-dependent: on a French layout the right-hand Alt key reports `key: "AltGraph"`, `code: "AltRight"`, while on US it reports `key: "Alt"`, `code: "AltRight"`.

### Recommended modifier guard for #514

```ts
const isBindable = (event: KeyboardEvent) =>
  !event.ctrlKey && !event.metaKey && !event.altKey && !event.getModifierState("AltGraph");
// shiftKey and CapsLock deliberately permitted — they are glyph modifiers
```

Rejecting `altKey` is the recommendation, on the grounds that on macOS it produces glyphs the user cannot predict or re-find, and on Windows it either does nothing to `key` (making `Alt+R` and `R` indistinguishable in storage) or is AltGr in disguise. #514 only excludes Cmd and Ctrl explicitly; this is the gap that needs a ruling.

Also note that a modifier key pressed _by itself_ generates its own `keydown` with `key: "Shift"` / `"Control"` / `"Alt"` / `"Meta"` / `"CapsLock"`. These must be skipped rather than captured, so the capture input can sit through `Shift`-then-`2` and only commit on the `2`.

---

## 5. Conventional accessible names for non-printing keys

There is no single normative registry of display names. Three establishment-grade conventions exist, and they disagree in useful ways.

### ARIA — the machine-readable convention

`aria-keyshortcuts` uses UI Events key values with two adjustments: the keys are written out, and Space is spelled. From [MDN's `aria-keyshortcuts` reference](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-keyshortcuts) (mirroring [WAI-ARIA 1.2 §6.6.6](https://www.w3.org/TR/wai-aria-1.2/#aria-keyshortcuts)):

- Written-out key names: `Space`, `Tab`, `Enter`, `ArrowUp`, `PageUp`, `Escape`. Modifiers: `Alt`, `Control`, `Shift`, `Meta`, `AltGraph`. Joined with `+`; the plus key itself is written `plus`.
- The value is **case-insensitive**: `"Shift+Control+V"` ≡ `"control+shift+v"`.
- Modifiers first, exactly one non-modifier, last: `"V+Shift+Control"` is invalid.
- Crucially, and in direct tension with #514's model: "**Write the actual keys pressed, not the result.** For example, on a USA keyboard, if you need the `@` symbol, the key combination is written as `"Shift+2"`, not `"@"` nor `"Shift+@"`."
- On layouts: "Take into account the diversity of available keyboards and the various keyboard language preferences. Modifier keys are often used to create language specific common punctuation symbols and number characters."
- On visibility: "Ensure all keyboard shortcuts are both visible to sighted users and made available to assistive technology… In addition, show the shortcut in menus and tooltips."

The APG adds the discoverability principle ([Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)): "The primary means of making functions and their shortcuts discoverable is by making the target elements focusable and revealing key assignments on the element itself."

**Tension worth flagging for #519:** ARIA says record `Shift+2`; #514 says record `@`. Both are defensible — ARIA optimises for a screen reader telling the user which physical keys to hit, #514 optimises for a Show author who thinks in glyphs. If the inspector row exposes `aria-keyshortcuts`, the two forms will need translating, and there is no lossless mapping from `@` back to `Shift+2` without knowing the layout. Recommend: store the glyph (#514's model), and if `aria-keyshortcuts` is set, set it to the glyph anyway and accept the minor non-conformance rather than fabricating a layout assumption.

### Microsoft — spell it out, sentence case

From the [Microsoft Writing Style Guide](https://learn.microsoft.com/en-us/style-guide/a-z-word-list-term-collections/term-collections/keys-keyboard-shortcuts):

- "In general, use sentence capitalization for key names… Capitalize letter keys in general references. **Example** the K key."
- Arrow keys: "Arrow keys are labeled only with an arrow… Use sentence capitalization to refer to a specific arrow key: _the Left arrow key, the Right arrow key, the Up arrow key,_ or _the Down arrow key_." And: "Don't use _direction keys, directional keys,_ or _movement keys_."
- Space: "**Spacebar** — Capitalize. Use to refer to the _Spacebar_."
- Tab: "**Tab** — Capitalize. Use to refer to the _Tab key_."
- Enter: "**Enter** — Capitalize. Use to refer to the _Enter key_. On the Mac, use only when functionality requires it." (On Mac: "**Return** — Capitalize. Use to refer to the _Return key_ on the Mac keyboard.")
- Escape: "Always use _Esc,_ not _Escape_."

So Microsoft would render #514's example set as **K**, **Left arrow**, **Spacebar**, **Tab**, **Enter** — never a bare glyph.

### Apple — glyphs

Apple's [Mac keyboard shortcuts](https://support.apple.com/en-us/102650) reference publishes single-character glyphs: Command ⌘, Shift ⇧, Option ⌥, Control ⌃, Caps Lock ⇪, and for non-modifiers Esc ⎋, Tab ⇥, Return ⏎. The arrow keys are listed with arrow glyphs; the space key is referred to as "Space bar" with no glyph. (Caution: the glyphs macOS menus actually render for arrow key equivalents are the plain arrows U+2190–U+2193 — `←` `→` `↑` `↓` — which is what #514 proposes; treat the support-page symbols as a naming reference rather than a character-for-character spec.)

### Authoring tools

VS Code accepts lowercase names in `keybindings.json` — `left`, `up`, `right`, `down`, `pageup`, `pagedown`, `end`, `home`, `tab`, `enter`, `escape`, `space`, `backspace`, `delete` — and renders shortcuts "in the UI using the current system's keyboard layout", so the _displayed_ form follows the OS convention (⌘⇧⇥ on macOS, `Ctrl+Shift+Tab` on Windows) rather than the stored name ([VS Code, Key Bindings](https://code.visualstudio.com/docs/configure/keybindings)). This is the same split #514 needs: a stable stored value plus a platform-shaped rendering.

### Recommended display mapping for the inspector

#514 already picks the shape (alphanumerics uppercased, specials spelled out or shown as a single glyph). Reconciling the three conventions above:

| `key`                       | Suggested display           | Rationale                                                             |
| --------------------------- | --------------------------- | --------------------------------------------------------------------- |
| `"a"`…`"z"`                 | `A`…`Z`                     | Microsoft: "Capitalize letter keys in general references"             |
| `"0"`…`"9"`, `"@"`, `"?"` … | the glyph itself            | matches what is printed on the key                                    |
| `" "`                       | `Space`                     | ARIA's name; Apple's "Space bar"; avoids rendering an invisible label |
| `"Tab"`                     | `Tab`                       | universal                                                             |
| `"Enter"`                   | `Enter` (`Return` on macOS) | Microsoft explicitly platform-splits this                             |
| `"ArrowLeft"`               | `←` (U+2190)                | Apple convention; #514's stated preference                            |
| `"ArrowRight"`              | `→` (U+2192)                |                                                                       |
| `"ArrowUp"`                 | `↑` (U+2191)                |                                                                       |
| `"ArrowDown"`               | `↓` (U+2193)                |                                                                       |

The arrow glyphs need an accessible text alternative, since `←` alone reads poorly to a screen reader. Microsoft's names — "Left arrow", "Right arrow", "Up arrow", "Down arrow" — are the established wording for that alternative. Same for `Space`, where the visible label is a word but the value is a space.

---

## 6. Consequences for #514 / #519

1. **Listen on `keydown`.** `keypress` is spec-deprecated and structurally cannot see Tab or the arrows.
2. **Store `event.key`.** Normalise: if `[...key].length === 1`, casefold (`key.toLowerCase()`) at both bind and match time — this is what "case-insensitive" has to mean given Shift and CapsLock are both glyph modifiers. Leave named keys (`Tab`, `Enter`, `ArrowLeft`) in their spec casing; they are already canonical.
3. **Reject at capture:** `isComposing`, `keyCode === 229`, `key ∈ {"Dead", "Process", "Unidentified", "Escape"}`, bare modifier keydowns (`Shift`/`Control`/`Alt`/`Meta`/`CapsLock`), `ctrlKey`, `metaKey`, `altKey`, `getModifierState("AltGraph")`.
4. **Filter `event.repeat`** in the capture input, and (recommended) at dispatch too, so a held key doesn't fire a navigation at the OS auto-repeat rate.
5. **Decide the Space storage form.** `" "` is what the platform gives; it is also the value most likely to be lost by trimming or by a GraphQL/JSON round trip that treats it as blank. Either store `" "` and audit every boundary, or store `"Space"` and translate at the edges. The second is what ARIA and every authoring tool named above do.
6. **Accept that bindings are glyph-portable, not key-portable.** A Show authored on US QWERTY binding `?` is unusable on a layout where `?` is not shift-reachable. Worth a line in the inspector's help text; not worth engineering around.
7. **The "no modifiers" rule needs an explicit ruling on Alt/Option**, which #514 does not give. Recommendation above: reject it.

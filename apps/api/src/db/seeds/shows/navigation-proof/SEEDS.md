---
name: Navigation Proof
description: A three-scene navigation demonstration comparing Shared and per-connection Devices
---

# Flow

## Navigation

A Flow with three Scenes: Red, Green, and Blue. The Flow's default Scene is Red. Each Scene belongs to this Flow and uses its matching color: `red`, `green`, or `blue`.
The Flow is wired to one Shared Device and one per-connection Audience Device. Shared connections observe one server-owned active Scene; each Audience connection navigates its own client-owned Flow state.

Lay out the three scenes evenly spaced in a single row inside the Flow; place both devices to the right of the flow.

# Scenes

## Red

A 720x480 Scene with a dark red root Canvas. It displays a large `Red` title and two buttons: `Go to Green` and `Go to Blue`.

## Green

A 720x480 Scene with a dark green root Canvas. It displays a large `Green` title and two buttons: `Go to Red` and `Go to Blue`.

## Blue

A 720x480 Scene with a dark blue root Canvas. It displays a large `Blue` title and two buttons: `Go to Red` and `Go to Green`.

# Interactions

Each destination button emits a `tap` Event through an Event Binding owned by its Scene. Each binding resolves to one Cue owned by that Scene. Each Cue owns one ordered Navigate Action targeting the named destination Scene.

Seed all six transitions:

- Red → Green
- Red → Blue
- Green → Red
- Green → Blue
- Blue → Red
- Blue → Green

Each Scene also listens for the first letter of each destination's colour, so pressing `R` goes to Red, `G` to Green, and `B` to Blue. These are `keypress` Event Bindings on the Scene's root Element — a Canvas-scoped Event is bound to the root, since there is no Element under a keyboard — and each one resolves to the _same_ Cue as the matching button, so one Cue answers to both a tap and a keypress.

No Scene binds its own letter: it owns no Cue that navigates to where it already is. Each Scene therefore has two tap bindings and two keypress bindings, and four Cues in total are shared between them.

The Navigate graph edges are projected from the Cue and Navigate Action definitions. Do not seed standalone or null-paired Navigate edges.

# Unsupported functionality

This proof Show has no Shapes, Sources, Transformers, Variables, Blocks, or per-connection state. Do not add those records or invent runtime behavior for them.

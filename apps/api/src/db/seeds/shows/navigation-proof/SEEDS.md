---
name: Navigation Proof
description: A three-scene Shared Device demonstration of Event to Cue to Navigate Action transitions
---

# Flow

## Navigation

A Flow with three Scenes: Red, Green, and Blue. The Flow's default Scene is Red. Each Scene belongs to this Flow and uses its matching color: `red`, `green`, or `blue`.

The Flow is wired to one Shared Device named Navigation Proof Device. The Device is Flow-driven rather than per-connection, so every connection paired to it observes the same active Scene.

Lay out the three scenes in an equilateral triangle; the flow's containing rect should have plenty of space around them. The device should be to the right of the flow.

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

The Navigate graph edges are projected from the Cue and Navigate Action definitions. Do not seed standalone or null-paired Navigate edges.

# Unsupported functionality

This proof Show has no Shapes, Sources, Transformers, Variables, Blocks, or per-connection state. Do not add those records or invent runtime behavior for them.

---
name: Simple Counter
description: A single-scene counter with a connected number Variable and increment button
---

# Simple Counter

The Show has one top-level `Counter` Scene, one top-level number Source, and one shared `Counter Display` Device. The Source is wired to the Scene's `Counter` Variable, which drives the Canvas text element.

The `Increment` Cue is bound to the button's `tap` Event. Its Update Action adjusts the Source by `1`, so the connected text updates after every click.

The seed intentionally has no Flow, Shape, Transformer, Block, or navigation interaction.

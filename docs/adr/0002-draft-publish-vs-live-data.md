# Structural changes are draft/publish; live data changes propagate immediately

Show structure (Canvas/Element edits, wiring, Cue/Action logic, Flow layout) is edited as a draft and only reaches connected Devices via an explicit whole-Show "publish" action, with immediate cutover — but live _data_ changes (Variable/Source values, e.g. a vote tally incrementing) propagate to connected Devices immediately, with no publish step, regardless of draft/publish state.

We considered treating everything uniformly (either all-live or all-draft/publish), but structural edits are dangerous to apply mid-performance (an in-progress Cue could reference an Element that no longer exists), while data changes are the entire point of live interactivity and must never be gated behind a manual publish click. Publishing applies immediately and globally to all connected Devices (not per-Scene, not deferred to next navigation) — the director explicitly chose "least work on the audience's part" over "never mutate a Scene the audience is currently looking at."

**Consequence**: the backend needs two distinct write/propagate paths — one through the draft→publish→version pipeline, one that writes live data and fans it out via the realtime layer directly — rather than a single uniform mutation pipeline.

# Players do not predict server-owned Transformer outputs

- Status: Accepted
- Issue: [Decide whether Players predict Show-level Transformer outputs](https://github.com/fauxparse/mechane/issues/888)
- Related: [[0004]], [[0015]], [[0018]]

## Context

A Player shows its own writes before the server confirms them. It replays its pending writes over each snapshot ([[0015]]): a per-connection Player replays its Show writes (#886), and a Shared Device's Player replays every Update its Cues make (#887).

Transformer outputs the server owns do not move with those writes. These are Show-level Transformers, plus Flow-local Transformers on a Shared Device ([[0004]]). The snapshot carries their outputs as precomputed values in `sourceValues`, and `resolveGraph` treats a Transformer whose id it finds there as already resolved. So a phone's pending vote updates `candidates[n].votes` at once, but a "leader" or "sorted results" Transformer wired after it keeps its old value until the next snapshot arrives.

Predicting those outputs would mean evaluating server-owned Formulas on the Player. [[0004]] rejected that because shared results could drift between clients. A prediction is provisional and the next snapshot replaces it, so drift would only cause a flicker. That weakens [[0004]]'s argument here. It does not touch #674's reason for keeping Formula bodies off phones: a Show-level Formula never leaves the server.

## Decision

Players do not predict server-owned Transformer outputs. A Transformer output downstream of a pending write keeps the server's last value until a snapshot replaces it. The Player sends no Show-level Formula bodies, and the server sends no Run shuffle seeds to Players.

A per-connection Player still evaluates its own Flow-local Transformers against the composed scope ([[0018]]), so those follow its pending writes at once. One exception: if the input path passes through a server-owned Transformer, they wait for the snapshot too.

## Considered and rejected

**Predict on the Player.** The server would send Show-level Formula bodies, port Types (graph ports carry none, only the copies in the Flow bundle do), and the Run's Show-level shuffle seeds; Players get `shuffleSeeds: {}` today. The snapshot would also have to keep stored values apart from Transformer outputs, so the Player could recompute only the Transformers downstream of a pending write. That reverses #674 and amends [[0004]]. Large Filter or Shuffle Transformers would also spend phone CPU inside the Formula budgets. Computed identities are deterministic, so a correct prediction would not remount Slots. The cost is the protocol change, not the rendering.

**Mark outputs as pending.** The Player would keep the server's last value but tell the Canvas it is pending, so a Scene could dim or animate it. No Formulas reach the phone. It needs a design for what "pending" looks like on a Canvas, and no Show has asked for one yet.

## Consequences

- The lag after a write is one snapshot round trip: the write's acknowledgement, the invalidation, and the refetch. The Player renders the stored value immediately and the derived value after.
- No new Formula, Type or seed data reaches Players. #674's boundary stands.
- Revisit this when a real Show makes the lag visible, for example a live leaderboard on the voting phone. Predicting on the Player would then supersede this ADR and amend [[0004]]. Marking outputs as pending would add to this ADR rather than replace it.

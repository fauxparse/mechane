---
name: build-seeds
disable-model-invocation: true
description: Regenerate sample-show seed modules from their SEEDS.md descriptions.
---

# Build sample-show seeds

Regenerate the TypeScript seed module beside each sample-show specification.

## Steps

1. Discover every directory under `apps/api/src/db/seeds/shows`.
2. Read that directory's `SEEDS.md` completely before editing its TypeScript module.
3. Treat the specification as the source of truth for Show names, Shapes, Sources, Flows, Scenes, Devices, Blocks, Canvases, assets, and defaults.
4. Write the generated module to the directory's `[directory-name].ts` file and export `seedShow` with:
   - `name`: the specification's Show name
   - `seed(showId)`: the complete seed operation for that Show
5. Keep shared database lifecycle and Canvas persistence helpers in `apps/api/src/db/seeds/utils`.
6. Resolve files in the Show's `assets/` directory relative to the generated module.
7. When the specification requests unsupported functionality, seed every supported structural part and omit the unsupported behavior. Do not add product functionality, fake runtime state, or failing placeholders.
8. Keep the Show seed's focused contract tests beside its generated module.

## Completion

A build is complete when every `shows/*/[show].ts` module exports a valid `seedShow`, every specification-backed supported record is represented, unsupported behavior is omitted without failing the seed, and `pnpm db:seed` plus the affected focused tests pass.

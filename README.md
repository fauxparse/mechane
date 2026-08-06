# Mechanē

An application for building interactive tech for live theatre shows across multiple devices — projectors, laptops, and audience mobile phones.

- [PRD.md](./PRD.md) — v1 scope, architecture, tech choices, and the agentic implementation process
- [CONTEXT.md](./CONTEXT.md) — domain vocabulary (Show, Scene, Device, Flow, Run, etc.) — read this before touching domain logic
- [docs/adr/](./docs/adr/) — architecture decision records

## Workspace layout

```
apps/
  studio/       Authoring + show-running app (directors/technicians)
  player/       Device client — renders Scenes, emits Events (audience phones, projectors, laptops)
  api/          GraphQL API (graphql-yoga) + Better Auth, deployed as Vercel serverless functions
packages/
  domain/            Domain model types and logic
  graphql-schema/     GraphQL schema and generated client
  design-system/      Theme tokens and shared components (Storybook-documented)
  realtime/           Internal pub/sub abstraction (Ably behind the scenes)
  commands/           Shared Command/undo-redo engine
```

## Getting started

```
pnpm install
docker compose up -d        # local Postgres for apps/api
cp apps/api/.env.example apps/api/.env
pnpm --filter @mechane/api db:migrate   # apply Better Auth's tables
pnpm db:seed      # wipe + recreate a default dev account (test@example.com)
pnpm dev:studio   # authoring app
pnpm dev:player   # device client
pnpm dev:api      # GraphQL + auth API (http://localhost:4000)
pnpm test         # unit tests
pnpm lint
pnpm typecheck
pnpm codegen      # regenerate packages/graphql-schema's schema.graphql + gql.tada types
```

## Typed GraphQL documents (gql.tada)

`apps/api`'s schema is defined in code (`apps/api/src/graphql/schema.ts`, via
`graphql-yoga`'s `createSchema`) rather than as a `.graphql` SDL file. Two
files are generated from it and checked into git — not gitignored, so a
schema change shows up as a reviewable diff:

- `packages/graphql-schema/schema.graphql` — the SDL, produced by running
  `printSchema` on the live schema module (`packages/graphql-schema/scripts/generate-schema.ts`).
- `packages/graphql-schema/src/graphql-env.d.ts` — [gql.tada](https://gql-tada.0no.co)'s
  schema-types file, generated from `schema.graphql` by the `gql.tada` CLI.

Regenerate both with `pnpm codegen` (root) or
`pnpm --filter @mechane/graphql-schema codegen` after changing `apps/api`'s
schema. CI runs the same command and fails the build if it produces a git
diff, so these files can never silently go stale (see
`.github/workflows/ci.yml`).

GraphQL operations are authored as typed documents with gql.tada's
`graphql()` tagged template (see `packages/graphql-schema/src/show.ts`,
`me.ts`, `user-settings.ts`) — no per-query generated files, no manual
result/variable types to keep in sync. `graphqlRequest`
(`packages/graphql-schema/src/client.ts`) is generic over gql.tada's typed
document node, so calling it with one of these documents infers the
result and variables types automatically.

### Editor setup (required for inline validation/autocomplete)

This is a one-time step per editor, not tribal knowledge — without it,
`graphql(`...`)` templates still type-check correctly (the CLI/CI don't need
this), but you won't get inline GraphQL errors, autocomplete, or hover docs
while writing them.

1. **Use the workspace TypeScript version**, not your editor's bundled one —
   gql.tada's editor support is a TypeScript language-service plugin
   (`gql.tada/ts-plugin`, configured in
   `packages/graphql-schema/tsconfig.json`), and those only load with a
   workspace-installed TypeScript. This repo ships `.vscode/settings.json`
   with `typescript.tsdk` pointing at `node_modules/typescript/lib` and
   `typescript.enablePromptUseWorkspaceTsdk: true` — VS Code will prompt
   "Allow" the first time you open a `.ts` file in this repo; accept it (or
   run **TypeScript: Select TypeScript Version → Use Workspace Version**
   manually). Other editors: point your TypeScript language server at
   `node_modules/typescript/lib` the same way.
2. Install the **"GraphQL: Syntax Highlighting"** VS Code extension
   (`GraphQL.vscode-graphql-syntax`, listed in `.vscode/extensions.json`) so
   the contents of `graphql(`...`)` templates are highlighted as GraphQL —
   the actual validation/autocomplete/hover comes from the TS plugin above,
   this just makes the text readable.
3. Open any file under `packages/graphql-schema/src/*.ts` and edit inside a
   `graphql(`...`)` template — e.g. add a bogus field to the `Show` query in
   `show.ts` — you should see a red squiggle and a "Cannot query field" error
   from the TypeScript language service, plus autocomplete when typing a new
   field name. That's the check that the setup actually took effect.

If another package or app starts authoring its own `graphql()` documents
(rather than just importing the typed exports from
`@mechane/graphql-schema`, as `apps/studio` does today), add the same
`gql.tada/ts-plugin` entry to its `tsconfig.json`, pointing `schema` at
`packages/graphql-schema/schema.graphql` and `tadaOutputLocation` at
`packages/graphql-schema/src/graphql-env.d.ts` (paths relative to that
package) so it shares the one generated schema-types file.

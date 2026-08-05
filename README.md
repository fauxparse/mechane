# Presence

An application for building interactive tech for live theatre shows across multiple devices — projectors, laptops, and audience mobile phones.

- [PRD.md](./PRD.md) — v1 scope, architecture, tech choices, and the agentic implementation process
- [CONTEXT.md](./CONTEXT.md) — domain vocabulary (Show, Scene, Device, Flow, Run, etc.) — read this before touching domain logic
- [docs/adr/](./docs/adr/) — architecture decision records

## Workspace layout

```
apps/
  app-studio/   Authoring + show-running app (directors/technicians)
  app-player/   Device client — renders Scenes, emits Events (audience phones, projectors, laptops)
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
pnpm dev:studio   # authoring app
pnpm dev:player   # device client
pnpm test         # unit tests
pnpm lint
pnpm typecheck
```

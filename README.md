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
pnpm --filter @presence/api db:migrate   # apply Better Auth's tables
pnpm db:seed      # wipe + recreate a default dev account (test@example.com)
pnpm dev:studio   # authoring app
pnpm dev:player   # device client
pnpm dev:api      # GraphQL + auth API (http://localhost:4000)
pnpm test         # unit tests
pnpm lint
pnpm typecheck
```

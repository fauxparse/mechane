# Presence — v1 PRD

Presence is an application for building interactive tech for live theatre shows across multiple devices — projectors, laptops, and audience mobile phones. This document specifies the initial (v1) release: functionality, architecture, tech choices, and the process for handing implementation to agents.

Domain vocabulary (Show, Scene, Device, Flow, Variable, Source, Transformer, Element, Block, Slot, Event, Cue, Action, Shape, Run, Wiring/Connecting) is defined in [CONTEXT.md](./CONTEXT.md) — read that first. This PRD does not redefine those terms; it specifies how they get built. Architectural decisions with lasting consequences are recorded as ADRs in [docs/adr/](./docs/adr/) and referenced inline below.

## 1. Scope

**In scope for v1**: the full domain model in CONTEXT.md — Shows, Scenes, Canvas/Elements, Devices, Flows, Sources, Transformers, Shapes, Blocks/Slots, Events/Cues/Actions, Runs — plus a Figma-lite Canvas editor with auto-layout, a Flow-based Show editor, a Command-K palette with undo/redo across both, and a themeable design system.

**Out of scope for v1** (explicitly deferred, not forgotten):
- Multiplayer/concurrent editing of a Show (target: v1.5)
- Audio/video Elements and cross-device playback sync
- Cross-Show Block libraries (Blocks are scoped to a single Show)
- Offline Event queueing on the audience client (reconnect-and-resync only for now; queue-while-offline is noted for later)
- Concurrent/simultaneous Runs of the same Show (touring, multi-venue)
- Teams/Orgs and any sharing/permissions model (Shows are owned by a single user account)
- Billing/monetization (no paid tiers, no Stripe)
- E2E test automation (deliberately excluded — see §8)

## 2. Applications

Monorepo, two deployable apps plus shared packages:

| App | Purpose | Users |
|---|---|---|
| **`app-studio`** | Authoring *and* running shows: Show (Flow) editor, Scene (Canvas) editor, Device/Run management, going live | Directors/technicians |
| **`app-player`** | Renders whatever Scene the connected Device is showing, emits Events | Audience phones, projectors, laptops, any paired Device |

Shared packages (indicative, not prescriptive of final folder names): domain model/types, GraphQL schema & generated client, design system (theme tokens, primitives), realtime abstraction (§4.4), command/undo-redo engine (§6.3).

## 3. Tech stack

- **Language**: TypeScript everywhere
- **Frontend**: React, TanStack Router, TanStack Query, Vite
- **API**: GraphQL
- **Realtime**: Ably, behind an internal abstraction — see [ADR-0003](./docs/adr/0003-ably-behind-realtime-abstraction.md)
- **Database**: PostgreSQL
- **Blob storage**: S3-compatible; MinIO in a container for local dev
- **Auth**: Better Auth — email/password + Google OAuth
- **Styling/components**: Tailwind CSS v4 (CSS-first `@theme` config), shadcn/ui built on a Base UI adapter (not Radix) as the primitive layer, Lucide for icons
- **Flow editor**: React Flow (Show/Flow graph UI)
- **Expression evaluation**: JEXL subset, server-side only — see [ADR-0004](./docs/adr/0004-server-side-sandboxed-transformers.md)
- **Component docs/dev**: Storybook
- **Testing**: Vitest (unit, required for domain logic); no E2E framework (see §8)
- **Lint/format**: oxlint/oxfmt
- **Package management**: pnpm workspaces (monorepo)
- **Hosting**: Vercel
- **CI/tickets**: GitHub Actions, GitHub Issues (new repo — needs initial setup)

## 4. Architecture

### 4.1 Deployment model

Fully cloud-hosted; there is no local/venue-hosted server component. See [ADR-0001](./docs/adr/0001-cloud-hosted-no-local-server.md) for why, and the accepted risk (a show cannot run if the director's internet fails).

### 4.2 Draft/Publish vs. live data

Two distinct write paths — see [ADR-0002](./docs/adr/0002-draft-publish-vs-live-data.md):

1. **Structural changes** (Canvas/Element edits, wiring, Cue/Action logic, Flow layout) are edited as a draft. Publishing is a single, whole-Show, all-or-nothing action producing a new version. Publish cuts over **immediately** to all connected Devices — no waiting for a Device's next Scene navigation.
2. **Live data changes** (Variable/Source values changing at runtime — vote tallies, etc.) propagate to connected Devices immediately via the realtime layer, independent of draft/publish state, at any time.

### 4.3 Runs and Devices

- A **Run** is a discrete live instance of a Show; starting one resets live data to defaults. At most one Run is active per Show at a time (concurrent Runs are out of scope, §1).
- Devices are defined in the Show graph at authoring time, each with a stable 6-digit pairing code that lives at the **Show** level and persists across every Run (not regenerated per performance).
- Two pairing tiers:
  - **Audience code**: public (shown as an on-screen QR/code), many phones connect to the same logical Device, Events are anonymous/aggregated, no session tracking.
  - **Crew codes**: one distinct code per single-endpoint Device (projector, laptop, scorekeeper view, etc.), never displayed publicly, given directly to techs.
- Device **role** is a first-class distinction (Audience vs. single-endpoint), because it changes Event attribution — not because connections are restricted by count. There is **no enforcement of single-connection exclusivity** in v1: a second device can pair with a single-endpoint code at any time and takes over (last-connection-wins) with no rejection — this deliberately supports recovering from a dead laptop mid-show without a "kick" workflow.

### 4.4 Realtime layer

Ably provides pub/sub for pushing Scene navigation, Cue/Action results, and live data changes to connected Devices — ordered, guaranteed delivery, presence, reconnection catch-up. All application code calls a small internal `RealtimeChannel`-style interface, never the Ably SDK directly, so the implementation is swappable. See [ADR-0003](./docs/adr/0003-ably-behind-realtime-abstraction.md).

Flow: a mutation (Cue firing an Action, a Source value changing) writes to Postgres, then publishes to the Ably channel for that Run; connected Devices are subscribers.

### 4.5 Transformers

Transformer expressions (JEXL subset) evaluate **server-side only**, never on-Device, so every connected Device sees an identical result. See [ADR-0004](./docs/adr/0004-server-side-sandboxed-transformers.md).

### 4.6 Canvas rendering

Elements render as DOM + CSS (React components), shared between the Screen editor's live preview and `app-player`'s rendering — not a canvas/WebGL renderer. Chosen for flexible, responsive layout across a wide range of phone screen sizes over pixel-identical cross-device rendering; see the auto-layout requirements in §6.1.

## 5. Data model additions beyond CONTEXT.md's glossary

CONTEXT.md is intentionally implementation-free; the following are still domain-level and now live there too:

- **Run** — see §4.3, and the CONTEXT.md entry.
- **Device role** (Audience / single-endpoint) — affects Event attribution; not enforced as a connection-count restriction in v1.

## 6. Editor requirements

### 6.1 Scene/Canvas editor ("Figma-lite")

- Same interaction model as Figma: nested Element hierarchy (layers panel), visual canvas, property inspector, clean/minimal chrome.
- **Auto-layout** (flexbox-style) is in scope for v1, at this depth: direction, gap, padding, primary/counter-axis alignment, per-child sizing modes (hug/fill/fixed). **Deferred**: wrap, and absolute-position overrides within an auto-layout frame.
- This is the mechanism for making Scenes work across "the multitude of different phone screen sizes" — treat it as a functional requirement, not cosmetic parity with Figma.

### 6.2 Show/Flow editor

Built on React Flow, for the Scene/Flow state-machine graph (Flows, Navigate Actions between Scenes) and the Show-level wiring graph (Sources/Transformers → Variables).

### 6.3 Command palette, keyboard access, undo/redo

- A Command-K style palette is available throughout `app-studio`.
- All mutations in both editors go through one shared internal Command abstraction (single package, used by both the Canvas and Flow editors) — this is what makes consistent keyboard shortcuts, palette entries, and undo/redo possible across both editors rather than building each twice.
- Undo/redo is **session-local** (in-memory stack, cleared on reload) and implemented as **forward commands**: undoing computes and sends the inverse of a change as an ordinary command, not a special rollback operation. See [ADR-0005](./docs/adr/0005-undo-as-forward-commands.md).
- Near-total keyboard operability for both editors is a requirement, with one accepted exception: dragging nodes in the Flow diagram.

## 7. Design system

- **Modes**: light and dark, default **dark**.
- **Themes**: switchable, shipped as a real per-account setting (not a dev-only toggle) — persisted on the user, exposed in a Settings UI.
  - Default theme: slate greys with pink/purple accents.
  - Second built-in theme: gruvbox-inspired (browns/oranges).
  - Theme system should be trivially extensible to more themes later (token-driven, not one-off hardcoded overrides).
- **Aesthetic**: flat, minimalist, subtle — content should read as the focal point, not the chrome.
- **Typeface**: Space Grotesk.
- **Implementation**: Tailwind v4 for styling/theming, with theme tokens (mode + palette) defined once as CSS variables that every component consumes — no component hardcodes a color. Components are shadcn/ui, generated via the shadcn CLI onto a Base UI adapter (not Radix), so every atomic primitive (button, input, label, etc.) is a real shadcn component rather than hand-rolled markup. Icons via Lucide.

## 8. Testing & CI

- **Required**: unit tests (Vitest) for all domain logic, enforced on every PR.
- **Not required**: end-to-end test automation (e.g. Playwright) — deliberately excluded per the product owner's experience of E2E suites being brittle. Critical live-show flows (pairing → Event → Cue/Action → propagation) should instead get thorough unit/integration coverage at the logic layer plus manual verification before release, rather than a browser-driven E2E suite.
- **CI**: GitHub Actions, gating on lint (oxlint) + unit tests.

## 9. Agentic implementation process

- **Repo**: new GitHub repo, pnpm monorepo, GitHub Issues for ticket tracking (both need initial setup — not yet created).
- **Ticket convention**: one issue = one vertical slice — independently implementable and independently mergeable, spanning whatever layers (schema → resolver → UI) it needs rather than being split by layer. Avoid tickets that can't be verified/tested in isolation.
- **Review gate**: every PR must pass CI (lint + unit tests) before merge; domain-logic packages require unit test coverage as a review gate, not just a suggestion.
- **Component convention**: any PR that adds or materially changes a visual/UI component must add or update its Storybook story in the same PR — not as separate follow-up work. This is how the design-system library (§7) stays a living, browsable reference rather than drifting out of date.
- **Sequencing note for whoever breaks this PRD into tickets**: the domain model is large (§1 says "everything" is in scope), so sequence foundational vertical slices first — Show/Scene/Device CRUD + basic Canvas rendering + Run/pairing — before layering in Transformers, Shapes, and Blocks/Slots, even though all of them ship in v1.
- **ADRs**: recorded in `docs/adr/`, referenced above — agents implementing around these decisions should read the relevant ADR rather than re-deriving the reasoning (or worse, "fixing" a deliberate choice).

## 10. Open items for whoever scopes the first implementation tickets

- Observability/error tracking tooling was not specified in this PRD and should be chosen (e.g. Sentry) when the repo is scaffolded.
- Exact GraphQL schema for Shapes (structured type definitions) and how they map to Postgres storage for Source data isn't specified here — implementation detail, not a product decision, but should be resolved before Source/Shape tickets are written.
- Standard Better Auth flows (email verification, password reset) are assumed default-configuration; no custom requirements were specified.

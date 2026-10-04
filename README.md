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
  site/         Holding page at the apex domain — Studio sign-in link and waitlist form
  api/          GraphQL API (graphql-yoga) + Better Auth, deployed as Vercel serverless functions
  storybook/      Repository-level Storybook host for Studio and shared packages
packages/
  domain/            Domain model types and logic
  graphql-schema/     GraphQL schema and generated client
  design-system/      Theme tokens and application-chrome components (Storybook-documented)
  rendering/          Shared Canvas/Element DOM + CSS renderer for Studio and Player
  realtime/           Internal pub/sub abstraction (Ably behind the scenes)
  commands/           Shared Command/undo-redo engine
```

## Getting started

```
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/api/.env.test.example apps/api/.env.test
cp apps/studio/.env.example apps/studio/.env
cp apps/site/.env.example apps/site/.env
overmind start -f Procfile.dev   # starts the app services, infrastructure, and local HTTPS proxy
# Mailpit is available at https://mail.mechane.dev for verification and reset messages.
# Open a captured message to preview its HTML or inspect its plain-text alternative.
# Local development SMTP uses Mailpit; no email provider credentials are needed.
# In another terminal, after Postgres and MinIO report ready:
pnpm --filter @mechane/api db:migrate   # apply the development database schema
pnpm db:test:migrate                         # apply the test database schema
pnpm db:seed      # wipe + recreate pre-verified dev accounts: test@example.com (user) and admin@example.com (admin)
# Sign in as admin@example.com to reach the admin area at https://studio.mechane.dev/admin.
# The API persistence tests use mechane_test on the same Postgres server, not the dev database.
# The seed command refuses to run with NODE_ENV=production.
pnpm test         # unit and database-backed API tests
pnpm lint
pnpm typecheck
pnpm codegen      # regenerate packages/graphql-schema's schema.graphql + gql.tada types
```

## Source value clipboard

The Studio Source inspector offers **Default** and **Current** targets, **Copy value**,
**Copy plain JSON**, and **Paste**. The editor below these controls always edits the
authored Default. Editing, pasting, undoing, or redoing a Default does not change an
active Run's Current values or their identities, including with Auto-publish on.
Starting or resetting a Run materializes its published Defaults.

Typed Copy writes a version-1 `mechane/source-value` envelope to `text/plain`.
It preserves declared Types and sharing within the selected value; plain JSON
expands sharing into independent occurrences. Paste requires compatible declared
Types and exact Field names, keeps untouched Default overrides, and gives additional
optional destination Fields explicit absence rather than their inherited Defaults.
Pasted `null` means absence, not “reset to inherited.” Images must identify an
existing, active destination-owned asset and its exact revision; Paste imports no assets.
Intake is limited to 10 MiB of UTF-8 text and 100,000 logical records, inclusively.
Malformed or unused supplied records are rejected.

Focus the non-text value region for native Copy/Paste. An unprepared Copy prepares
the value without changing the clipboard; a second gesture writes it. Ordinary
inputs and selected text retain their native editing behavior. Values offer no Cut
or Duplicate. A failed asynchronous clipboard read offers an explicit native-Paste
path rather than another automatic read.

Current Paste always requires confirmation of the exact Run, Source/Field, storage
scope, old/replacement values, representation, and alias effects. Cancel starts
focused; **Replace Current value** submits the live write. Current changes have no
authored Undo and do not change Default. A Flow-scoped Current target additionally
requires choosing an existing Shared Device Instance explicitly: no first-instance
fallback, broadcast, state initialization, or per-connection target. A disconnected
Shared Instance with existing state remains eligible.

Default Paste is one atomic saved edit and one session-local Undo entry. If a
submitted response is lost, Paste and authored history remain blocked while Copy
stays available. **Check submitted result** looks up that exact server-issued
operation identity; it does not replay the mutation. The unresolved identity
survives a page reload, but authored history does not.

See [the portable transfer contracts](./docs/issues/877-portable-transfer-contracts.md)
for the envelope, compatibility, outcome, and scope rules.

## Parallel worktrees and OMP

The primary checkout uses the normal stack:

```sh
overmind start -f Procfile.dev
```

For parallel work, create a Git worktree from the primary checkout:

```sh
pnpm mechane:worktree create issue/123-fix-canvas
cd ../mechane-issue-123-fix-canvas
```

The `create` command installs dependencies in the new worktree. Start its
app instance and OMP session with one command:

```sh
pnpm mechane:up
```

Secondary worktrees use direct HTTP and automatically receive their own Studio,
Player, holding page, API, Overmind socket, and OMP profile. They reuse the primary
Postgres/MinIO stack; Caddy and DNSMasq remain single-host services.

Useful commands from a worktree:

```sh
pnpm mechane:worktree status
pnpm mechane:worktree stop
pnpm mechane:omp -- --continue
```

`pnpm mechane:up` prints the assigned URLs. Port assignments and generated
Overmind files are stored outside the repository under
`~/.omp/mechane-worktrees`.

When OMP is already running in a checkout, ask it to use the `issue-worktree`
workflow, for example:

```text
Fix issue #123 in a worktree.
```

OMP can use an isolated task workspace for a one-session change. For a
persistent issue branch and pull request, it creates an
`issue/<number>-<short-slug>` worktree and starts a new OMP session from that
directory. The current OMP session cannot change its own working directory.

The OMP-specific workflow is defined in `.omp/AGENTS.md` and the
`.omp/skills/issue-worktree` skill. Keep the primary checkout clean and do all
issue edits, tests, commits, and pull-request operations in the issue worktree.

### Local HTTPS aliases

The development proxy runs in Docker with Caddy's internal certificate
authority. Overmind starts it through the `proxy` process in `Procfile.dev`.
The aliases are:

- `https://mechane.dev` → holding page on `localhost:5175`
- `https://studio.mechane.dev` → Studio on `localhost:5173`
- `https://show.mechane.dev` → Player on `localhost:5174`
- `https://api.mechane.dev` → API on `localhost:4000`

The resolver below covers `mechane.dev` itself as well as its subdomains.

On macOS, configure the project resolver once:

```sh
sudo mkdir -p /etc/resolver
printf 'nameserver 127.0.0.1\nport 53\n' | sudo tee /etc/resolver/mechane.dev
```

Start the stack with `overmind start -f Procfile.dev`. The first Caddy
request creates its local root certificate. Copy it out and trust it on the
host:

```sh
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt /tmp/mechane-caddy-root.crt

# macOS
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain /tmp/mechane-caddy-root.crt

# Debian/Ubuntu
sudo cp /tmp/mechane-caddy-root.crt /usr/local/share/ca-certificates/mechane-caddy.crt
sudo update-ca-certificates
```

Restart the browser after trusting the certificate. Firefox may require
importing the certificate into its own certificate store. Caddy keeps its
certificate authority in the `mechane-caddy-data` Docker volume; do not
commit the extracted certificate.

Linux hosts without a resolver-file integration can use these equivalent
entries in `/etc/hosts` as a fallback:

```text
127.0.0.1 mechane.dev studio.mechane.dev show.mechane.dev api.mechane.dev
```

To remove the macOS resolver configuration:

```sh
sudo rm /etc/resolver/mechane.dev
```

The direct HTTP services remain available at `localhost:5173`, `localhost:5174`,
`localhost:5175`, and `localhost:4000` when the proxy is unavailable. Run the
Vite process directly with `VITE_DEV_PROXY=false` when using that fallback so
HMR uses HTTP.

When Google sign-in is enabled, register
`https://api.mechane.dev/api/auth/callback/google` as the local OAuth redirect
URI. The corresponding API and Studio values are in the checked-in
`.env.example` files.

## Scene artboard sizing

Set a Scene root's width or height to **Fill container** to use the available
Player viewport on that axis. Fixed axes keep their authored dimensions.
Each filled root axis always shows its minimum-size input in the inspector.
Switching to Fill initializes a missing minimum from the current artboard size.
These minimums size the Canvas editor preview, not the Player, so a smaller
Device can still display a filled Scene without a minimum forcing overflow.

With a Scene root selected, the size preset menu above the width and height
fields lists common screen, phone, and tablet sizes. Choosing a preset sets
fixed axes to its size and sets filled axes' minimums to it. The menu reads
**Custom size** when the root matches no preset; the fields still take any size.

## Canvas Artboard names

Double-click a Scene or Block Artboard title in the Canvas editor to rename its
owner. Enter or blur saves the name; Escape cancels. Each committed rename is
one undo step, and the saved name survives reload.

## Local image storage

MinIO runs at `http://localhost:9000` with its console at `http://localhost:9001`.
The development bucket is `mechane`, and image URLs point directly to its public
`mechane/blobs/` objects. Default local credentials are `minioadmin` /
`minioadmin`; change them before using a shared or deployed environment.

Image uploads in the Source table editor save the completed upload's asset id
and exact revision. They do not wait for the image asset list to refresh before
assigning the Field value.

## Custom Domains in development

The API uses the local domains provider unless `CUSTOM_DOMAINS_PROVIDER=vercel`.
It never touches DNS or Vercel: every Ownership Proof is found, the hostname is
never misconfigured, and the HTTPS check passes, so a domain added in Studio
walks to Live on its own. Add `.localhost` hostnames such as
`vote.voting.localhost`; they open the Player at
`http://vote.voting.localhost:5174/`. Only the local provider accepts them.
The dev server runs the Custom Domain checker every 15 seconds; deployed, it
runs from `/api/cron/custom-domains` on `CRON_SCHEDULE`.

`pnpm dev:domains` overrides those facts for one hostname:

```
pnpm dev:domains vote.voting.localhost proof               # withhold the Ownership Proof
pnpm dev:domains vote.voting.localhost proof --keep a@b.nz # keep only that user's proof
pnpm dev:domains vote.voting.localhost proof --since 8d    # and backdate when it went missing
pnpm dev:domains vote.voting.localhost point               # DNS misconfigured
pnpm dev:domains vote.voting.localhost cert                # HTTPS check fails
pnpm dev:domains vote.voting.localhost drift               # both, for a Live domain
pnpm dev:domains vote.voting.localhost clear               # remove the overrides
```

Each command also makes the hostname's domains due, so the next pass picks the
change up. Production refuses to start unless `CUSTOM_DOMAINS_PROVIDER=vercel`.

## Adding a built-in color theme

Built-in themes are generated from checked-in Base16/Base24 scheme files. Do not
add palette names directly to components, Storybook, or domain validation.
The generator publishes the manifest metadata that those consumers use.

1. **Choose a declared dark/light pair.** Both files must be genuine variants
   from the same theme family; do not infer a light scheme by inverting the
   dark scheme. Copy the source files into
   `packages/design-system/vendor/tinted-theming-schemes/`, preserving the
   upstream YAML and the vendored `LICENSE`.
2. **Update the manifest.** Add an entry to
   `packages/design-system/src/themes/manifest.json`:

   ```json
   {
     "key": "my-theme",
     "label": "My Theme",
     "primary": "blue",
     "dark": "base16/my-theme-dark.yaml",
     "light": "base16/my-theme-light.yaml"
   }
   ```

   `key` becomes the `data-theme-palette` value and persisted palette value.
   `primary` must be one of the fixed hue slots: `red`, `orange`, `yellow`,
   `green`, `aqua`, `blue`, or `purple`. The first manifest entry is the
   default palette.

3. **Keep the source pin current.** The manifest's `sourceCommit` must match
   the commit used for the vendored Tinted Schemes files. If the upstream
   corpus is updated, update the pin and review the vendored licence and
   source files together.
4. **Generate the outputs:**

   ```sh
   pnpm --filter @mechane/design-system generate:themes
   ```

   The command parses and validates both schemes, generates the eleven-step
   hue and neutral scales, emits `src/styles/generated-theme.css`, updates
   palette metadata, and writes the contrast report and acknowledgement file.
   `src/styles/globals.css` is static and imports the generated stylesheet; do
   not edit generated token blocks by hand.

5. **Review and verify.** Inspect the generated CSS and
   `src/styles/contrast-report.json`. Contrast findings are reported rather
   than used to fail generation; resolve or explicitly acknowledge any
   intentional violations. Then run:

   ```sh
   pnpm vitest run packages/domain/src/theme-settings.test.ts packages/design-system/scripts/theme-generator.test.ts
   pnpm typecheck
   pnpm lint
   pnpm build-storybook
   ```

   The generated domain and design-system metadata automatically update
   palette validation, labels, Storybook's palette toolbar, and API defaults.

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

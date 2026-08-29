# Agent instructions

## GitHub issue workflow

For implementation work tied to a GitHub issue, the deliverable is a pushed branch with a pull request—not only a local commit:

1. Check out a dedicated branch before editing code, using `issue/<number>-<short-slug>` unless the user specifies another branch.
2. Reference the issue number in every related commit message, for example `feat: add canvas gestures (#57)`.
3. Issue-management-only work (such as creating or editing an issue without code changes) does not require a branch or commit.
4. If asked to "fix" or "implement" an issue directly, create a todo for the delivery gate: push the branch, create the PR, and verify the PR before reporting completion.
5. Before the final response for issue implementation work:
   - Push the current issue branch with `git push --set-upstream origin <branch>` (or `git push` when upstream is already configured).
   - Create a PR with `gh pr create` if the branch has no PR.
   - Verify it with `gh pr view --json number,url,state,headRefName`; a commit without a PR is incomplete.
   - Include the verified PR URL in the final response.

## React code quality

Any change touching React code (`apps/studio`, `apps/player`, `packages/design-system`) must be scanned with [React Doctor](https://react.doctor/docs) before you call the work done. It sits alongside `pnpm lint`, `pnpm typecheck` and `pnpm test` — not instead of them; it catches React-specific mistakes those three do not see.

```sh
pnpm react-doctor --verbose --scope changed   # only what your change introduced
pnpm react-doctor --verbose                   # the whole codebase
```

The script is called `react-doctor`, not `doctor`: **`pnpm doctor` is pnpm's own built-in command** and will happily run and tell you about your node_modules instead. And use the script rather than `npx react-doctor@latest`, which silently scans with a different version than CI — `pnpm react-doctor` runs the version pinned in the root `devDependencies`.

Every finding your change introduced must be resolved before the work is done. Resolve means one of:

1. **Fix it.** The default. `pnpm react-doctor why <file>:<line>` explains what fired and why.
2. **Suppress it, with a reason.** Put a `// react-doctor-disable-next-line <plugin>/<rule>` comment _immediately above the reported line_ (not above the enclosing statement — it will not take), preceded by a comment saying why the rule is wrong here. A bare suppression is not acceptable.
3. **Turn the rule off** in `doctor.config.ts`, if it is wrong for this codebase rather than for one line. Use `pnpm react-doctor rules disable <rule>` so the edit is well-formed, and leave a comment explaining the call.

Pre-existing findings in files you touch are not yours to fix — leave them, or open a follow-up issue. Do not bundle an unrelated cleanup into a feature branch.

Two things run this for you automatically:

- **The `react-doctor` agent skill** (`.agents/skills/react-doctor/`) is vendored into the repo, with compatibility links for agents that use `.claude/skills/` or `.omp/skills/`. It is installed by `pnpm react-doctor install`; if you re-run that, re-apply the local edit that points its commands at `pnpm react-doctor` rather than `npx`.
- **CI** (`.github/workflows/react-doctor.yml`) scans every pull request and posts a summary comment covering only the issues that PR introduced. It is advisory for now — it will not fail your build. Read the comment anyway.

There is also an optional pre-commit hook (`pnpm react-doctor install` writes it to `.git/hooks/pre-commit`) that blocks a commit on new error-severity findings in staged files. It lives outside version control, so it is per-clone and you may not have it.

## Storybook

Add Storybook stories for each new UI component. When testing using Storybook, use the server that is already running on port :6007. Do not start new Storybook instances except in the case where there is no server running on :6007.

Storybook stories MUST NOT make live network or API requests. Put remote data access behind a provider interface, and wrap stories with deterministic static or mock providers as Storybook decorators. QueryClientProvider is acceptable when its data is fully static and no live requests can occur.

## Orthography

Use `color` spelling in code and comments.

## Development environment

The development stack is launched with Overmind using `Procfile.dev`. Do not start any services separately yourself. If the development server is not running, you can use `overmind start -f Procfile.dev`; to restart individual services use `overmind restart [service_name]` (see `Procfile.dev` for available services).

## Agent skills

### Issue tracker

Issues and specs for this repo live as GitHub issues, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo: read the root `CONTEXT.md` and relevant ADRs in `docs/adr/`. See `docs/agents/domain.md`.

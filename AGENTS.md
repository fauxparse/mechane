# Agent instructions

## GitHub issue workflow

For implementation work tied to a GitHub issue:

1. Check out a dedicated branch before editing code, using `issue/<number>-<short-slug>` unless the user specifies another branch.
2. Reference the issue number in every related commit message, for example `feat: add canvas gestures (#57)`.
3. Issue-management-only work (such as creating or editing an issue without code changes) does not require a branch or commit.

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

- **The `react-doctor` agent skill** (`.claude/skills/react-doctor/`) is vendored into the repo, so it loads for whoever is working here. It is installed by `pnpm react-doctor install`; if you re-run that, re-apply the local edit that points its commands at `pnpm react-doctor` rather than `npx`.
- **CI** (`.github/workflows/react-doctor.yml`) scans every pull request and posts a summary comment covering only the issues that PR introduced. It is advisory for now — it will not fail your build. Read the comment anyway.

There is also an optional pre-commit hook (`pnpm react-doctor install` writes it to `.git/hooks/pre-commit`) that blocks a commit on new error-severity findings in staged files. It lives outside version control, so it is per-clone and you may not have it.

## Storybook

Add Storybook stories for each new UI component. When testing using Storybook, use the server that is already running on port :6007. Do not start new Storybook instances except in the case where there is no server running on :6007.

## Orthography

Use `color` spelling in code and comments.

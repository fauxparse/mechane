# OMP worktree workflow

This repository supports concurrent Git worktrees and app instances.

## Choose the workflow

- A normal session in the primary checkout may use `overmind start -f Procfile.dev`.
- A secondary worktree uses `pnpm mechane:up`; it allocates ports, starts a worktree-local Overmind group, and launches OMP with a worktree-specific profile.
- Use `pnpm mechane:worktree create issue/<number>-<slug>` from the primary checkout when a persistent issue worktree does not exist.
- Use `pnpm mechane:omp -- --continue` when OMP must be launched without starting app processes.
- Use `pnpm mechane:worktree status` and `pnpm mechane:worktree stop` for the current worktree.

## Agent behavior

When a user explicitly requests work in a worktree, use the `issue-worktree` skill. Preserve the current checkout, use an `issue/<number>-<slug>` branch, and report the worktree path before editing. Do not claim that an OMP session changed its own cwd: launch a new OMP process in the created worktree or use an explicitly isolated task workspace.

When a user asks to start development, use the helper instead of hand-writing a Procfile or port assignments. Secondary instances use direct HTTP and reuse the primary Docker infrastructure. The checked-in Caddy and DNSMasq services are single-host services; do not start duplicate proxy infrastructure.

The helper records instance assignments under `~/.omp/mechane-worktrees`, outside the repository. Its generated process files and sockets are disposable. Verify the printed URLs and process status before reporting the instance ready.

## Browser verification against the dev proxy

`https://studio.mechane.dev`, `show.mechane.dev`, and `api.mechane.dev` are served through the checked-in Caddy proxy with `tls internal` — Caddy's own local CA, already trusted in the macOS System keychain (see the README's "Trust the certificate" step; verify with `security find-certificate -c "Caddy" /Library/Keychains/System.keychain`). Reaching these hosts to verify Studio/Player changes needs a browser that honors that trust.

The `browser` tool's default headless device launches with `--use-mock-keychain`, so it never sees the Keychain entry and fails with `Failed to fetch` against any `*.mechane.dev` URL. Fix: open a dedicated instance instead of the default device, pointed at the browser tool's own managed Chrome binary (glob `~/.omp/puppeteer/chrome/*/chrome-mac-arm64/*.app/Contents/MacOS/*`) with a scratch `--user-data-dir`:

```json
{ "action": "open", "url": "https://studio.mechane.dev/",
  "app": { "path": "<globbed path above>", "args": ["--headless=new", "--user-data-dir=/tmp/omp-cft-<label>-profile"] } }
```

That binary is a separate app installation from anything under `/Applications`, so `close` with `kill: true` on it only tears down the instance you spawned.

**Never** set `app.path` to `/Applications/Google Chrome.app` (or any other real, user-installed browser) for a session you intend to `kill`. macOS treats a launched app by bundle identity, not by `--user-data-dir` — a second launch of the same `.app` is still "Google Chrome," and killing it quits every window under that identity, including whatever the user already had open. This has actually happened: it took down the user's real Chrome mid-session. If a real installed browser must be driven live, use `app.relay: true` (the OMP Browser Relay extension) instead of spawning it.

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

---
name: issue-worktree
description: Use when the user asks to fix, implement, or investigate a GitHub issue in a worktree, especially requests such as "fix issue #123 in a worktree". Chooses persistent worktree or isolated task execution, preserves the current checkout, and starts the matching Mechanē app instance when needed.
---

# Issue worktree workflow

## Select the execution mode

1. If the user wants a persistent branch or pull request, use a real Git worktree.
2. If the user only wants the change isolated from the current checkout, use one OMP task with `isolated: true`; the project config applies the resulting patch to the parent checkout.
3. Never silently edit the primary checkout when the user explicitly requested a worktree.

## Persistent branch

1. From the primary checkout, create the branch and worktree:

   ```sh
   pnpm mechane:worktree create issue/<number>-<short-slug>
   ```

2. Report the absolute worktree path and branch before editing.
3. Launch the new session from that directory:

   ```sh
   cd <worktree>
   pnpm mechane:up
   ```

4. Use `pnpm mechane:worktree status` to verify the app group. The helper prints the assigned Studio, Player, API, and OMP profile.
5. Keep all subsequent edits, tests, commits, and PR operations in the issue worktree.

The current OMP process cannot change its own session cwd. A persistent-worktree flow therefore requires launching OMP in the new directory. Do not pretend that `git -C`, `cd`, or `--add-dir` moved the session.

## Isolated task

When a persistent PR worktree is not required, delegate the complete change as one isolated task with `isolated: true`. Require the task to finish with the behavioral verification relevant to the issue. Review the resulting patch in the parent checkout before reporting completion.

## Delivery guardrails

- Use `issue/<number>-<short-slug>` for issue branches.
- Preserve unrelated user changes in the original checkout.
- Run app processes through `pnpm mechane:up`; do not hand-write secondary Procfiles or port assignments.
- Reuse the primary Docker infrastructure unless the issue requires isolated database or object-storage state.
- For issue implementation work, follow the repository delivery gate: commit with the issue number, push the branch, create a PR, and verify the PR before reporting completion.

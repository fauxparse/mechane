---
name: commit
description: Create a Git commit when the user asks to commit changes. Enforces the repository's issue-linked branch and commit-message workflow.
---

# Commit changes

Use this skill whenever the user asks you to commit, make a commit, or save work in Git.

## Procedure

1. **Identify the issue.** Find the issue number in the conversation or current branch name (`issue/<number>-<slug>`). If this is implementation work and the number is unknown, stop and ask for it. Issue-management-only work is exempt.
2. **Inspect the worktree.** Run `git status --short --branch` and review the diff. Confirm that only intended files are staged or will be staged. Never include unrelated user changes.
3. **Check the branch.** For issue implementation, require `issue/<number>-<slug>`. If the branch is wrong, stop and ask whether to switch it; do not silently create or move branches.
4. **Stage deliberately.** Stage the intended files, then inspect `git diff --cached`.
5. **Write the message.** Use a concise conventional message and include the issue reference in the subject, for example:

   ```text
   feat: add canvas gestures (#57)
   fix: preserve run state on reload (#57)
   ```

   Use `Closes #57` only when this commit is intended to close the issue. The subject must contain `(#57)` or an equivalent `#57` reference.
6. **Commit.** Create the commit only after the staged diff and message are verified.
7. **Verify.** Run `git show --stat --oneline HEAD` and `git log -1 --format=%s`. Confirm the commit contains the issue number and only intended changes. Report the commit hash and subject.

## Completion criteria

The commit is complete only when the final commit's subject visibly contains the issue number, the branch matches the issue, and the staged diff has been checked before committing.

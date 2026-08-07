---
name: create-pr
description: Create a GitHub pull request when the user asks to open or create a PR. Ensures the PR is tied to its issue and describes verified changes.
---

# Create a pull request

Use this skill whenever the user asks you to open, create, or submit a GitHub PR.

## Procedure

1. **Identify the issue.** Find the issue number in the conversation or branch name (`issue/<number>-<slug>`). For implementation work, stop and ask if it is unknown.
2. **Verify the branch and history.** Run `git status --short --branch`, identify the base branch, and inspect commits since the base. Require an issue branch for issue implementation. Every related commit subject must contain the issue reference; fix or ask before opening the PR if any does not.
3. **Review the diff.** Inspect the complete base-to-head diff for unrelated files, secrets, generated artifacts, and accidental changes. Resolve those before creating the PR.
4. **Run applicable checks.** Use the repository's documented lint, typecheck, test, and React Doctor checks when React code changed. Report failures instead of hiding them.
5. **Push the branch** only with user authorization or when the user explicitly asked to create the PR and the repository workflow permits it.
6. **Write the PR body.** Include a short summary, testing performed, and a closing reference such as `Closes #57` when the PR should close the issue. Use `Refs #57` when it should remain open. Do not rely on the commit message alone for closure.
7. **Create the PR** with `gh pr create` against the confirmed base branch, then verify the returned URL and title/body. Report the URL.

## Completion criteria

The PR is complete only when its head branch, commit history, base-to-head diff, checks, and issue-closing/reference line have all been verified, and GitHub returns a PR URL.

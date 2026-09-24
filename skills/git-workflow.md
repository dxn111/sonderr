---
id: git-workflow
name: Git workflow & clean history
category: Engineering
icon: ⑂
triggers: git, commit, branch, merge, rebase, pull request, pr, push, cherry-pick, stash, tag, release, history, conflict
summary: Branch, commit, and merge with a clean, reviewable history — no lost work, no mystery commits.
---
## When to use
- Any task involving commits, branches, merges, pull requests, or release tagging.
- Cleaning up a messy history or recovering from a bad merge/rebase.

## Approach
Small, single-purpose commits tell the story of the change; the branch is the narrative, the commit messages are the sentences. Never rewrite history that others may have built on, and always verify the working tree state before and after any history operation.

## Steps
1. Run `git status` and `git log --oneline -5` first — know exactly where you are and what is dirty before doing anything.
2. Branch per task with a short descriptive name (`fix/sidebar-logo`, not `patch-2`).
3. Stage deliberately (`git add <paths>`), never blanket `git add .` when unrelated changes exist.
4. Write commit messages that say WHY: imperative subject line ≤ 72 chars, body for context when needed.
5. Before merging: re-run tests, then merge (or rebase) and re-verify the result on the target branch.
6. On conflict: understand both sides fully before resolving — never pick a side blindly.

## Pitfalls
- Committing secrets, build artifacts, or `.env` files (check .gitignore first).
- `git push --force` on shared branches; use `--force-with-lease` only when truly alone.
- Amending or rebasing commits someone else already pulled.

## Verify
- `git status` clean, `git log` shows the intended commits, diff reviewed before push.

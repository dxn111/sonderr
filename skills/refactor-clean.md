---
id: refactor-clean
name: Refactor and cleanup
category: Engineering
icon: ⇄
triggers: refactor, cleanup, clean up, restructure, tech debt, technical debt, deduplicate, rename, reorganize, simplify, messy, spaghetti
summary: Improve structure without changing behavior — small steps, constant verification, preserved public contracts.
---
## When to use
- Code works but is hard to change, duplicated, or mislayered.
- The user asks to clean up, reorganize, or reduce technical debt.

## Approach
Behavior is frozen; structure moves. Every step must leave the system working, because a refactor that needs a big-bang finish is a rewrite in disguise.

## Steps
1. Pin down current behavior first: existing tests, or a quick characterization run of the main paths. This is your safety net.
2. Refactor in named micro-steps: extract, inline, move, rename, deduplicate — one concern per step, verified per step.
3. Preserve public contracts (exports, API shapes, file locations others import) unless the task explicitly includes changing them.
4. Move code toward the domain language: names should say what the thing is for, not how it is stored.
5. Delete dead code and stale comments as you pass them; do not build a museum.
6. Stop when the target concern is clean; resist repainting code nobody asked about.

## Pitfalls
- Mixing behavior changes into a refactor — now nothing can be verified independently.
- Large renames across boundaries without checking every import site.
- "Improving" abstractions that only had one concrete user.

## Verify
- After each step: syntax check plus the pinned behavior check, both green.
- Final diff contains zero behavior changes — say exactly how you confirmed that.

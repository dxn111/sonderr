---
id: code-review
name: Systematic code review
category: Quality
icon: ◉
triggers: review, code review, pr review, audit changes, diff, feedback, quality, approve, refactor review, check my code
summary: Review changes like a senior engineer — correctness first, then design, then style.
---
## When to use
- Reviewing a diff, PR, or recent change before it ships.
- The user asks to check, audit, or give feedback on specific code.

## Approach
Read the diff twice: once for correctness against intent, once for maintainability. Comments should be actionable and ranked — a logic bug matters more than a naming nitpick. Verify claims by running code, not by reading alone. For implementation work, review the produced diff against the original request before delivery; do not equate passing tests with a correct change.

## Steps
1. Understand the intent first: what was this change supposed to do? Read the task/issue/commit message.
2. Trace the core logic by hand with a concrete example input — off-by-ones and inverted conditions hide here.
3. Check boundaries: empty inputs, null/undefined, large inputs, concurrency, error paths.
4. Verify tests exist for new behavior and actually assert the new behavior (not just that code runs).
5. Evaluate design only after correctness: naming, duplication, coupling, dead code.
6. Run it (tests, typecheck, the app) — reading catches most but not all issues.
7. Report findings ranked: blockers, should-fix, nits — each with file:line and a concrete suggestion.
8. For changes involving state or APIs, trace one successful and one failure/idempotent path through callers and consumers. Check whether errors stay visible, repeated calls are safe, and outputs accurately describe what changed.
9. Re-read the user's acceptance criteria and inspect the final diff for unrelated edits, incomplete wiring, weakened safeguards, and claims unsupported by evidence. Fix concrete defects you find; do not add speculative polish or style-only churn.

## Pitfalls
- Reviewing style while missing that the feature doesn't actually work.
- Approving because tests pass, when tests don't cover the changed path.
- Vague feedback ("consider refactoring") with no actionable direction.
- Treating a tool returning success as proof of useful progress; check whether state or evidence actually changed.

## Verify
- Every finding backed by file:line and reproducible reasoning; run results quoted for anything behavioral.
- The final review names what changed, what was verified, and any meaningful unverified risk; it does not claim perfection.

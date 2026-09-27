---
id: test-and-verify
name: Test and verify
category: Quality
icon: ✓
triggers: test, testing, verify, verification, coverage, unit test, e2e, regression, quality, check my work, does it work, prove
summary: Build a verification loop proportional to risk — run checks, report exact results, never claim untested success.
---
## When to use
- After any code change, before reporting work as done.
- When the user asks whether something works, or asks you to check or prove behavior.

## Approach
Verification is part of sound engineering, but executing commands is a user-controlled action. Inspect available evidence and define a proportionate verification plan by default. Run tests, builds, scripts, or other project commands only when the user explicitly asks for tests/checks/verification or asks whether the change works. A request to implement or fix something alone does not authorize test execution. When execution was not requested, finish the requested implementation, inspect the diff, and clearly give the best next command without running it.

## Steps
1. Inventory what already exists to verify with: test suites, lint, typecheck, build, start commands. Read package scripts and CI config; this inspection is not permission to run them.
2. If execution was explicitly requested, run the narrowest relevant existing check first; a red baseline changes the plan. Otherwise document it as the first suggested command.
3. For changed behavior, define the observable outcome that proves it works — the exact command and expected output.
4. Add focused coverage only when the user asks for tests/test code or explicitly authorizes a regression test as part of the task.
5. Run checks only with explicit user authorization. Report command + exit status + key output lines, not adjectives; when not run, label proposed checks as not run.
6. If a check cannot run in this environment, say so plainly and list exactly what the user should run.
7. Prefer behavior assertions at the boundary that regressed: include the unchanged/idempotent case, a real-change case, and at least one failure or denied-access case when relevant. Avoid tests that merely mirror implementation branches without asserting observable behavior.
8. After code changes, inspect the final diff and run only checks that the user authorized and whose evidence is current and relevant. A repeated identical check is not additional confidence or progress; rerun it only when code, configuration, environment, or the question under test changed and execution remains authorized.

## Pitfalls
- Writing tests against the new implementation instead of the required behavior.
- Declaring "all tests pass" when you only ran one file — or none.
- Skipping the user-facing path: the feature must work where the user touches it, not only in unit scope.
- Counting a successful command as a pass without checking its exit status and relevant assertions.

## Verify
- Every claimed result has a command and observed output behind it.
- The primary user path was exercised, not just internals.
- Tests distinguish changed behavior from an idempotent no-op and cover relevant failure boundaries.

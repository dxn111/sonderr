---
id: technical-writing
name: Technical writing
category: Quality
icon: ≡
triggers: docs, documentation, readme, guide, runbook, release notes, changelog, tutorial, api reference, write documentation, explain how to
summary: Write docs the next maintainer can act on — accurate commands, expected outcomes, failure recovery.
---
## When to use
- Creating or updating README files, guides, runbooks, API references, or release notes.

## Approach
Write for the person who must act next, at 2am, from your text alone. Every command must be copy-paste runnable, every step must say what success looks like.

## Steps
1. Verify the reader's starting point: prerequisites, versions, permissions. State them or remove the doc's ambiguity.
2. Structure by task, not by internals: "Run the server", "Add a provider", "Rotate keys" — imperative titles.
3. Every command: exact, runnable, with expected output or a one-line "you should see".
4. Document the failure path for anything fragile: what breaks, the symptom, the recovery.
5. Keep examples true to the repository — real file names, real flags, no invented config.
6. Cut marketing adjectives; keep sentences short, present tense, active voice.

## Pitfalls
- Docs that describe an aspirational version of the system instead of the current one.
- Commands that were never run after the last refactor.
- Wall-of-text paragraphs where a numbered list was the answer.

## Verify
- Every command in the doc was executed in the workspace and its output matched what the doc claims.

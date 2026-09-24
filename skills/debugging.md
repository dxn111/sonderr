---
id: debugging
name: Systematic debugging
category: Engineering
icon: ⌖
triggers: bug, error, crash, fails, failing, broken, exception, stack trace, not working, doesn't work, debug, fix this, weird, regression, traceback, undefined, null
summary: Reproduce, isolate, and fix bugs with evidence — never patch symptoms or guess at causes.
---
## When to use
- Anything described as broken, crashing, failing, or behaving unexpectedly.
- A fix that did not stick, or an error whose cause is not yet proven.

## Approach
Reproduce first, theorize second. One confirmed fact from a real error message or log outweighs three plausible hypotheses. Change one variable at a time and keep the feedback loop as short as possible.

## Steps
1. Capture the exact symptom: full error text, stack trace, expected vs actual behavior.
2. Reproduce it reliably — a command, a request, or precise steps. If you cannot reproduce, state that and gather more data instead of guessing.
3. Read the stack trace bottom-up and open the exact files and lines involved before forming theories.
4. Form at most two or three candidate causes; rank them by likelihood and cost to test.
5. Test the cheapest hypothesis first with the smallest possible probe (log line, minimal input, isolated call).
6. Fix the cause, not the symptom — a guard that hides the error is not a fix.
7. Re-run the original reproduction to confirm the fix, then check adjacent paths for the same class of bug.

## Pitfalls
- "Fixing" by deleting the error handling or silencing the log.
- Editing three things at once, then not knowing which one worked.
- Claiming a fix without running the failing case again.

## Verify
- Original reproduction now passes; say the exact command or steps you ran.
- No new errors introduced on the paths you touched.

---
id: performance-review
name: Performance review
category: Quality
icon: ↗
triggers: performance, slow, latency, optimization, optimize, memory, bundle, startup, profiling, bottleneck, cache, speed up, lag
summary: Find measurable bottlenecks and make one small, verifiable improvement — no speculative optimization.
---
## When to use
- The user reports something is slow, heavy, or laggy.
- Before shipping a change with an obvious scaling cliff.

## Approach
No measurement, no optimization. Establish the user-visible symptom and a number for it first (seconds, MB, request count), then attack the dominant cost only.

## Steps
1. Turn the complaint into a measurable statement: what operation, how slow, on what input, measured how.
2. Profile or instrument the hot path; find where time or memory actually goes before touching code.
3. Classify the dominant cost: repeated work, unbounded payload, N+1 queries, blocking I/O, re-renders, cold starts.
4. Fix the single biggest cost with the smallest change that removes it — not a rewrite.
5. Re-measure with the same method and report before/after numbers honestly, including "no improvement" when it happens.
6. Check the fix did not regress clarity or correctness; remove micro-optimizations the measurement cannot justify.

## Pitfalls
- Optimizing the 5% path while the 80% cost sits elsewhere.
- Caching without an invalidation story.
- Reporting feelings ("much faster now") instead of numbers.

## Verify
- Before/after measurement on the same input, same method, both numbers reported.
- Behavior identical for the user: same output, same errors, same edge cases.

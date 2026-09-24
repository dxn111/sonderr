---
id: performance-profiling
name: Performance profiling
category: Engineering
icon: ◴
triggers: performance, slow, latency, profiling, profile, memory leak, memory usage, optimize, optimization, bottleneck
summary: Measure a bottleneck first, then make and verify the smallest high-confidence improvement.
---
## Workflow
1. Establish a baseline with the exact workload, environment, and metric: elapsed time, CPU, memory, request count, bundle size, or frame time.
2. Locate the dominant cost with a profiler, trace, focused timer, or allocation measurement. Do not optimize from intuition alone.
3. State the hypothesis and change one meaningful factor at a time.
4. Re-run the same workload, compare results, and check correctness plus failure behavior.
5. Record the tradeoff: memory versus CPU, startup versus steady state, readability versus speed, or cache freshness versus calls.

## Guardrails
- Preserve limits, validation, and security checks; performance is not a reason to skip them.
- Avoid unbounded caches and retries.
- Never report a percentage improvement without the before/after measurement and workload.

## Verify
- Baseline and post-change numbers use the same measurement method.
- Regression tests still pass.
- The improvement is meaningful for the user path, not only a synthetic microbenchmark.

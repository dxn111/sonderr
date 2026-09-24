---
id: error-handling
name: Robust error handling
category: Engineering
icon: ⚠
triggers: error handling, exception, try catch, retry, timeout, fallback, resilience, crash, unhandled, promise rejection, fail-safe, edge case
summary: Fail loudly on bugs, gracefully on flakiness — retries, timeouts, and error paths that actually help.
---
## When to use
- Adding resilience around network calls, file I/O, parsing, or user input.
- Errors being swallowed, crashes from unhandled rejections, or timeouts missing.

## Approach
Distinguish three error classes and handle each differently: programmer errors (should crash loudly in dev), expected failures (handle explicitly), and environmental flakiness (retry with backoff). Silent catch blocks are where bugs go to hide.

## Steps
1. Map the failure surface: every external call (network, fs, child process) and every parse of untrusted input.
2. Wrap external calls with explicit timeout + typed error, never rely on the default forever-block.
3. Retry only idempotent, transient failures — exponential backoff with jitter, capped attempts, then surface the final error.
4. Catch errors at the boundary where you can actually do something; log context (operation, input shape) not just the message.
5. Preserve error chains (cause/original error) — never `catch {}` and move on.
6. Fail fast on programmer errors (invariant violations) instead of corrupting downstream state.
7. Give users actionable messages: what failed, why, what to do next.

## Pitfalls
- Catching `Error` broadly and hiding the bug you needed to see.
- Retrying non-idempotent operations (double charge, double send).
- Logging the error but returning success to the caller.

## Verify
- Force each failure mode once (bad input, dead endpoint, timeout) and observe the intended behavior, not a crash.

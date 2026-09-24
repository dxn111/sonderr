---
id: node-backend
name: Node.js backend services
category: Backend
icon: ⬢
triggers: node, nodejs, express, server, api server, middleware, streams, async, event loop, worker, npm, memory leak, backend service
summary: Build Node services that don't leak, don't block, and fail loudly — event loop and async discipline.
---
## When to use
- Building or debugging Node servers, CLIs, workers, and async pipelines.
- Hung requests, event-loop blocks, memory leaks, unhandled rejections.

## Approach
Node's cardinal rules: never block the event loop with CPU work, never leave a promise unrejected, never assume request order. Structure services as small modules with explicit dependencies, single responsibilities, and errors that propagate to a real handler.

## Steps
1. Establish the error lifecycle: per-request try/catch, a process-level unhandledRejection/uncaughtException handler that logs and exits deliberately.
2. Keep handlers async-safe: every promise awaited or explicitly handled; no floating `fn()` on the request path.
3. Validate request input at the edge (types, lengths, formats) before it touches business logic.
4. Move CPU-heavy work off the loop (worker threads, chunking, or a queue) if any single operation exceeds ~10ms regularly.
5. Bound everything: request body size, concurrent connections, queue depth, cache size — unbounded growth is the default death.
6. Use streams for large payloads instead of buffering whole files/bodies in memory.
7. Health check + graceful shutdown: finish in-flight work on SIGTERM, then close.

## Pitfalls
- Synchronous fs/crypto calls on the request path.
- Modules with hidden singletons making tests order-dependent.
- Swallowed promise rejections that corrupt state silently.

## Verify
- Load-test lightly (e.g. 100 concurrent) while watching memory and latency; kill mid-flight and confirm clean recovery.

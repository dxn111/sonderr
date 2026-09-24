---
id: api-integration
name: API integration
category: Engineering
icon: ↗
triggers: api, endpoint, rest, graphql, webhook, provider, integration, http client, rate limit, byok, sdk, openai-compatible, third party, fetch
summary: Design reliable provider integrations — clean auth handling, normalized errors, timeouts, retries, observable behavior.
---
## When to use
- Connecting to an external API or building on a third-party service.
- Reviewing or hardening an existing integration that misbehaves under real conditions.

## Approach
Treat the provider as an unreliable actor: every call needs a timeout, an error path, and a story for "provider returned garbage". Never leak credentials, never trust response shape blindly.

## Steps
1. Read the existing integration first: base URLs, headers, auth flow, current error handling, and where secrets live.
2. Centralize the client: one place builds requests, one place maps errors. No scattered fetch calls with drift between them.
3. Set explicit timeouts on every outbound call and decide retry policy per error class (retry 429/5xx with backoff; never retry 4xx auth failures).
4. Normalize provider responses into local shapes at the boundary so the rest of the code never sees raw provider payloads.
5. Keep secrets out of logs, error messages, and client-visible payloads; read them from local config only.
6. Make degraded states understandable: surfaced, specific messages ("Provider rate-limited us, retrying in 20s"), not silent failures.

## Pitfalls
- Assuming OpenAI-compatible endpoints are identical — field support differs per provider.
- Retrying non-idempotent calls blindly.
- Logging full request bodies that contain keys or user content.

## Verify
- One forced failure path exercised (bad key or unreachable host) and its user-facing message checked.
- No secret appears in any log or error string produced during testing.

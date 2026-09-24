---
id: observability
name: Observability and diagnostics
category: Operations
icon: ◉
triggers: observability, diagnostics, telemetry, logging, trace, tracing, metrics, monitor, production issue
summary: Add useful, privacy-aware diagnostics that help explain real behavior without collecting secrets.
---
## Workflow
1. Identify the decision or failure a future maintainer needs to explain.
2. Define a small event schema: action, outcome, duration, safe error category, and correlation id when a request spans steps.
3. Keep logs structured and bounded. Redact credentials, private text, email bodies, wallet material, and raw provider payloads.
4. Make expected failures distinguishable from defects and expose a user-safe message separately from diagnostic detail.
5. Add a test that proves sensitive values do not appear in emitted diagnostics.

## Guardrails
- Do not add hidden analytics, network beacons, or permanent tracking to a local-first app.
- Do not log source files or prompts wholesale just to make debugging convenient.
- Set retention and size limits for any local diagnostic file.

## Verify
- A failed request can be diagnosed from the safe fields alone.
- Logs remain useful after redaction.
- Normal UI behavior does not depend on telemetry being enabled.

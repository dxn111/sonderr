---
id: ci-cd
name: CI/CD pipelines
category: Operations
icon: ⟳
triggers: ci, cd, pipeline, github actions, workflow, build, deploy, release, docker, container, artifact, automation, lint, actions.yml
summary: Build fast, reliable pipelines — fail early, cache well, and keep deploys boring.
---
## When to use
- Creating or fixing CI workflows, build automation, deployments, or release processes.
- Pipelines that are red, slow, or flaky.

## Approach
A pipeline is a quality gate, so its value is trustworthiness × speed. Fast feedback on cheap checks first (lint, typecheck, unit tests), expensive steps later (build, integration, deploy). Everything deterministic: pinned versions, cached dependencies, no snowflake manual steps.

## Steps
1. Map the current flow: what runs, in what order, what takes longest, what fails most.
2. Fail fast: order jobs cheap→expensive so a typo doesn't burn 10 minutes of build.
3. Pin tool versions (node, python, action refs) — unpinned CI rots silently.
4. Cache dependencies with a lockfile key; verify cache actually hits.
5. Make every step idempotent and re-runnable; a retry should never cause a different outcome.
6. Gate deploys on the full suite; never deploy from a red pipeline.
7. Keep secrets in the CI secret store, echoed nowhere.

## Pitfalls
- Flaky tests re-run into green — fix or quarantine, don't loop.
- Caching build artifacts without cache keys that change when inputs change.
- Manual "fix it on the server" steps that make CI a lie.

## Verify
- Push a deliberate failing commit: pipeline fails fast with a clear message; revert: it goes green.

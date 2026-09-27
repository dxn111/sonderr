---
id: release-verification
name: Release verification
category: Quality
icon: ◒
triggers: release checklist, release verification, prepare release, cut a release, release candidate, tag release, publish release, release readiness, production launch
summary: Turn a change into a reproducible release with clean state, checks, migration notes, and rollback facts.
---
## Workflow
1. Inspect branch, remote state, version files, generated artifacts, and uncommitted changes before deciding what to publish.
2. Inspect existing check definitions and map the primary user path and a failure path. Run them only if the user explicitly asks to execute release verification; otherwise list the exact checks as not run.
3. Review the final diff for secrets, accidental files, permission changes, and incompatible config.
4. Write concise release notes: user-visible changes, known limits, verification commands, and rollback/ref points.
5. Push or tag only within the user's requested scope; never force-update shared history without explicit authorization.

## Verify
- When publishing is explicitly in scope, confirm the remote ref, tag target, and clean working tree after publishing.
- Report the exact commit, tag, and checks rather than claiming a vague successful release.

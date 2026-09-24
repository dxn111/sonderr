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
2. Run the project checks plus the primary user path and one failure path.
3. Review the final diff for secrets, accidental files, permission changes, and incompatible config.
4. Write concise release notes: user-visible changes, known limits, verification commands, and rollback/ref points.
5. Push or tag only within the user's requested scope; never force-update shared history without explicit authorization.

## Verify
- Confirm the remote ref, tag target, and clean working tree after publishing.
- Report the exact commit, tag, and checks rather than claiming a vague successful release.

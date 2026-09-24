---
id: migration-upgrade
name: Migrations & upgrades
category: Operations
icon: ⇗
triggers: upgrade, migration, migrate, update dependency, breaking change, deprecation, version bump, major version, codemod, port, legacy
summary: Upgrade dependencies and schemas without downtime or surprise — in slices, with rollback paths.
---
## When to use
- Upgrading frameworks, languages, or dependencies (especially major versions).
- Database schema migrations or moving between APIs/libraries.

## Approach
Big-bang upgrades fail in unbounded ways; sliced upgrades fail in bounded ones. Every step must leave the system working and reversible, so a broken slice costs minutes, not days. Read the changelog/migration guide before touching code — the failures are usually documented.

## Steps
1. Read the migration guide/changelog for the target version; list every breaking change that touches this codebase.
2. Inventory usage: search for every deprecated API, removed export, changed signature actually used here.
3. Capture a working baseline first: tests green, build green, a smoke test of core flows — this is the rollback point.
4. Upgrade in slices: smallest safe increments (patch→minor→major), fixing and verifying after each.
5. For schema/data migrations: additive first (add new, dual-write), backfill, then switch reads, then drop old — never in-place destructive.
6. Replace deprecated calls even if shims still work — shims disappear in the next major.
7. Update docs/types/CI pins to match the new reality.

## Pitfalls
- Upgrading 15 dependencies at once so nothing is bisectable.
- Dropping columns/fields in the same release that stopped writing them.
- Trusting "no breaking changes" without running the test suite.

## Verify
- Full test suite + smoke test on the final version; rollback path proven; no deprecation warnings remain.

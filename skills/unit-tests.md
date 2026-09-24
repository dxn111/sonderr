---
id: unit-tests
name: Unit test design
category: Engineering
icon: ✓
triggers: unit test, tests, test suite, jest, pytest, mocha, vitest, coverage, tdd, test cases, mocking, assertion
summary: Write tests that catch real regressions — behavior over implementation, edge cases over happy paths.
---
## When to use
- Writing unit/integration tests for existing or new code, raising coverage where it matters, fixing flaky tests.

## Approach
Test observable behavior through the public interface, not internal calls. One test, one reason to fail, a name that reads as a sentence about behavior.

## Steps
1. Map the unit's contract: normal cases, boundary values, error paths, and invariants. Each becomes a test group.
2. Write the failing test first when fixing a bug — it proves the bug exists and later proves the fix (regression lock).
3. Structure as arrange/act/assert; assert on outcomes (return values, state, exceptions), never on call counts of private methods.
4. Cover the edges the happy path forgets: empty input, zero, negative, huge, unicode, null, concurrent, network failure. Mock only true externals (network, clock, fs); over-mocking tests the mock, not the code.
5. Run the full suite, not just new tests — name any pre-existing failures honestly instead of burying them.
6. Keep tests fast and deterministic: no sleeps, no live network, seeded randomness; save and present the test file when the suite is substantial.

## Pitfalls
- Snapshot tests nobody reads; tests that pass trivially (asserting the mock); chasing 100% coverage with assertions that assert nothing.
- Flaky tests left red — the team learns to ignore the suite.

## Verify
- Demonstrate that a regression test fails for the original behavior and passes after the fix when feasible.
- Run the focused test and the relevant broader suite; report skips and existing failures explicitly.
- Confirm tests use isolated fixtures and do not depend on live accounts, secrets, or timing luck.

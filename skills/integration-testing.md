---
id: integration-testing
name: Integration testing
category: Quality
icon: ◌
triggers: integration test, integration testing, end to end, end-to-end, e2e, user flow, regression flow, smoke test
summary: Verify a real user flow across boundaries instead of only testing isolated functions.
---
## Workflow
1. Name the user-visible flow, its starting state, expected result, and the boundaries crossed: UI, HTTP, storage, provider, filesystem, or connector.
2. Choose the smallest stable harness that exercises the real boundary. Prefer local HTTP requests over mocks when routing and headers matter.
3. Cover the success path, one invalid-input path, one permission/approval path, and one interrupted or expired state where relevant.
4. Keep test data isolated. Never use real credentials, mailboxes, funded wallets, or production accounts.
5. Assert observable outcomes: status code, persisted state, visible card, emitted event, file contents, or a returned error. Do not assert incidental implementation details.

## Guardrails
- A smoke test proves the app starts; it does not prove a workflow is safe.
- Do not test external sends or wallet broadcasts in an integration suite.
- Make destructive behavior opt-in and use disposable fixtures.

## Verify
- The test fails before the regression fix and passes after it.
- It can run from a clean checkout without a network secret.
- Failure output identifies the broken boundary clearly.

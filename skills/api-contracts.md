---
id: api-contracts
name: API contracts
category: Backend
icon: ⇄
triggers: api contract, endpoint contract, request schema, response schema, status code, backwards compatible, breaking api
summary: Design and verify stable HTTP or tool contracts with validation, errors, and compatibility in mind.
---
## Workflow
1. Write the caller, method, authentication/permission boundary, request fields, response fields, and error states before coding.
2. Validate types, sizes, enums, and cross-field relationships at the boundary.
3. Pick accurate status codes and stable, actionable error messages. Do not leak secrets or internal paths.
4. Treat optional fields and defaults as compatibility decisions; distinguish omitted from intentionally empty when it matters.
5. Test valid input, malformed input, unauthorized/forbidden input, oversized input, and an old-client compatible path.

## Guardrails
- Never accept a client-provided role, permission, file path, or secret without server-side checks.
- Keep confirmation tokens opaque, single-use, short-lived, and scoped to the reviewed action.
- Avoid response shapes that expose internal configuration or credential state.

## Verify
- Every documented outcome has a regression test.
- The endpoint behaves consistently for JSON parse errors and validation errors.
- Existing callers still work or the breaking change is explicit.

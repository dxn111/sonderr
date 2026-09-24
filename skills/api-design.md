---
id: api-design
name: REST & HTTP API design
category: Engineering
icon: ⇄
triggers: api, endpoint, rest, route, http, graphql, webhook, request, response, payload, pagination, versioning, openapi, swagger
summary: Design consistent, predictable APIs — resources, status codes, errors, and versioning done right.
---
## When to use
- Creating or changing HTTP endpoints, REST resources, or provider integrations.
- API inconsistencies surfacing: mixed status codes, unclear error payloads, breaking changes.

## Approach
APIs are contracts: consistency across endpoints beats local elegance. Design around resources and standard semantics first, add conveniences only when a real consumer needs them. Every error a client can hit should be one a client can understand and act on.

## Steps
1. Inventory the existing endpoints and conventions before adding new ones — match them unless they are objectively wrong.
2. Model resources, not actions: nouns for paths, HTTP verbs for operations (`POST /sessions`, not `/createSession`).
3. Use status codes honestly: 2xx success, 4xx caller error (400 validation, 401 auth, 403 permission, 404 missing, 409 conflict, 429 rate), 5xx server fault.
4. Shape error payloads consistently: `{ error: { code, message, details } }` — the same shape everywhere.
5. Validate all input at the boundary; never trust query/body types.
6. Paginate any unbounded list; cap page size; document the limit.
7. Write the contract down (routes + payloads) so frontend and backend stop guessing.

## Pitfalls
- Returning 200 with `{ ok: false }` — breaks every HTTP client's error handling.
- Leaking internal errors/stack traces in responses.
- Breaking changes without versioning (`/v2/...` or explicit deprecation).

## Verify
- Each endpoint exercised with a real request: success, one validation failure, and one auth failure path.

---
id: auth-system
name: Auth systems
category: Product
icon: ⌁
triggers: auth, authentication, login, logout, signup, sign in, sign up, password, session, jwt, oauth, permission, permissions, role, rbac, access control
summary: Design authentication and authorization with safe sessions, clear failure states, and no credential leaks.
---
## When to use
- Building or changing login, signup, sessions, permissions, or recovery flows.
- Reviewing anything that stores or checks credentials and tokens.

## Approach
Auth fails closed. Every path — including the weird ones (expired, half-signed-up, disabled account) — needs a defined, user-understandable outcome. Authorization is checked on the server for every request; the client is decoration.

## Steps
1. Model identity first: what identifies a user, how sessions are created, validated, expired, and revoked.
2. Store nothing sensitive in plaintext: hashed passwords (bcrypt/argon2), secrets in local config, tokens out of URLs and logs.
3. Enforce authorization server-side per request; render states client-side but never trust the client for decisions.
4. Design failure states explicitly: wrong password, unknown user, expired session, locked account, reset link reuse.
5. Rate-limit credential endpoints and confirmations; make recovery links single-use and short-lived.
6. Keep the UX honest: same generic message for "unknown user" and "wrong password"; clear next step on every error.

## Pitfalls
- Tokens in localStorage when httpOnly cookies were the right call.
- Permission checks duplicated in UI only.
- Password rules that force weak-but-compliant passwords; no breach reuse warnings.

## Verify
- Protected paths return 401/403 without valid credentials — actually tried, not assumed.
- Full happy path plus two failure paths exercised end-to-end.

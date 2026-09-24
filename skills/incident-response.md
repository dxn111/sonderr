---
id: incident-response
name: Security incident response
category: Safety
icon: ⚑
triggers: incident, breach, leaked key, compromised, security report, unsafe output, vulnerability report, containment
summary: Contain, preserve safe evidence, assess impact, rotate access, and communicate a security issue without spreading secrets.
---
## Workflow
1. Contain first: stop the unsafe action, disable the affected connector, revoke or rotate exposed credentials, and avoid further access.
2. Preserve a minimal timeline and sanitized reproduction; do not copy illegal material or secret values into tickets.
3. Identify affected users, data, versions, and trust boundaries; distinguish confirmed impact from hypotheses.
4. Patch and verify the root cause, then check adjacent paths for the same failure mode.
5. Communicate privately with clear severity, affected versions, mitigation, and disclosure expectations.

## Verify
- Confirm the exposed credential no longer works and that the safe reproduction no longer succeeds.
- Record what remains unknown and who owns the next action.

---
id: threat-modeling
name: Threat modeling
category: Safety
icon: ◈
triggers: threat model, attack surface, trust boundary, abuse case, security architecture, STRIDE, threat analysis
summary: Turn a feature description into concrete assets, trust boundaries, abuse cases, and mitigations.
---
## When to use
- Designing a feature that handles accounts, files, tools, network calls, or untrusted content.
- Reviewing a proposed integration before implementation.

## Workflow
1. Identify assets and unacceptable outcomes before listing vulnerabilities.
2. Draw the trust boundaries: user, browser, local server, provider, MCP server, filesystem, and subprocesses.
3. For each boundary, list spoofing, tampering, information disclosure, denial of service, and privilege-escalation cases that are plausible here.
4. Rank findings by impact and likelihood; separate confirmed paths from assumptions.
5. Choose mitigations that reduce authority, data exposure, or ambiguity at the boundary rather than adding a cosmetic warning.

## Verify
- Every high-risk flow has an explicit permission check, error state, and audit-visible outcome.
- The model never treats data crossing a boundary as instructions without validation.

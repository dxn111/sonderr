---
id: privacy-redaction
name: Privacy and redaction
category: Safety
icon: ◌
triggers: privacy, redact, redaction, personal data, pii, sensitive data, anonymize, data minimization, secret scan
summary: Minimize, classify, redact, and safely transport sensitive data without breaking the requested deliverable.
---
## Workflow
1. Classify the data: credentials, identity, contact, health, financial, private source, or ordinary content.
2. Decide whether the task needs the raw value; prefer a placeholder, hash, masked value, or synthetic example.
3. Keep secrets out of logs, prompts, screenshots, reports, commits, and tool results.
4. Verify output paths and provider destinations before sending data externally.
5. State what was redacted and what limitation that creates; do not silently alter evidence.

## Verify
- Search the final artifact and logs for common credential patterns and accidental personal data.
- Confirm the user can still reproduce the safe result from the redacted instructions.

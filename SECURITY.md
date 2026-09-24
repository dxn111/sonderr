# Security policy

Sonderr is a local-first desktop web workspace. It binds to `127.0.0.1` only and deliberately requires confirmation for external actions such as email and wallet sends. Those boundaries are important, but no software or model behavior is perfect.

## Supported release

The current public release on the `release-v1501` branch is supported. Please include the commit SHA or app version in a report.

## Report privately

Do not open a public issue for a security, privacy, wallet, credential, permission-bypass, or safety-boundary finding.

Send a private report to Dani through [Discord](https://discord.gg/wEz5j8VC) or [X](https://x.com/Dxn1_0day). Include a short, sanitized proof of concept, exact reproduction steps, expected versus observed behavior, platform, and the access level used. Do not send credentials, seed phrases, private keys, illegal material, or another person’s data.

The project is maintained by a solo developer. A typical first response target is within 9 hours, triage within 2 days, a discretionary €5–€10 payout for a valid in-scope report within 12 days, and a resolution target of 3–20 days depending on severity and complexity. These are targets, not guarantees.

## In scope

- Bypassing configured tool permissions or transaction/email confirmation.
- Exposing secrets, private key material, OAuth tokens, or hidden prompts through Sonderr.
- Local path traversal, cross-origin access, non-loopback exposure, or unsafe API behavior caused by Sonderr.
- Reliable prompt/tool flows that cross the documented safety boundary.
- Wallet behavior that signs, broadcasts, or changes the reviewed transaction unexpectedly.

## Out of scope

- Third-party provider, operating-system, browser, RPC, or dependency issues without a Sonderr-specific impact.
- Social engineering, spam, denial of service, physical attacks, or access to data you do not own.
- Model-quality reports without a reproducible Sonderr boundary failure.

## Safe research rules

Use only accounts, devices, wallets, files, and data you own or are explicitly authorized to test. Stop before causing harm. Do not publicly disclose a finding until the maintainer has had a reasonable opportunity to investigate and resolve it.

Sonderr Wallet remains experimental. It is not a primary wallet, custodian, or audited vault; keep only small test value in it.

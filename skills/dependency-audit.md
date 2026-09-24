---
id: dependency-audit
name: Dependency and supply-chain audit
category: Security
icon: ◫
triggers: dependency, package, npm, pip, supply chain, lockfile, transitive, vulnerable package, upgrade dependency
summary: Evaluate dependency changes for provenance, compatibility, vulnerabilities, and unnecessary authority.
---
## Workflow
1. Read the manifest and lockfile before changing versions; identify runtime, build, and optional dependencies.
2. Prefer the smallest supported version change and preserve the lockfile deterministically.
3. Check release provenance, advisories, license constraints, install scripts, native code, and transitive impact.
4. Review the diff and run the project's tests/build after installation.
5. Document why the dependency is needed, what permissions it gains, and how to roll back.

## Guardrails
- Never paste tokens into package commands or commit generated credentials.
- Do not replace a lockfile wholesale to silence a conflict.
- Treat install scripts and downloaded artifacts as code that needs review.

## Verify
- Confirm the manifest and lockfile agree and the smallest relevant tests pass.
- State which advisory sources and commands were actually checked; do not imply an audit is exhaustive.
- Keep the dependency diff limited to the intended package and required transitive changes.

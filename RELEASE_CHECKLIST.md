# Public-release checklist

Run this from a clean checkout before publishing a release.

- [ ] `npm ci`
- [ ] `npm run check`
- [ ] `npm test`
- [ ] `sh -n scripts/update-release.sh` and verify `test/update-gate.test.js` covers version ordering, unavailable checks, development-checkout protection, and the mandatory update state.
- [ ] `npm audit --omit=dev`
- [ ] `npm pack --dry-run` and confirm only runtime files are included.
- [ ] Run the public install script with an isolated `HOME`; confirm it installs the documented version and runtime dependencies, then launches successfully.
- [ ] Start with `node bin/sonderr-1.5.js --no-open --port 4300`; confirm the service binds only to `127.0.0.1`.
- [ ] Open the UI and verify onboarding, Settings, provider save/test, files, docs, responsive sidebar, and a basic non-tool chat.
- [ ] In an isolated managed install, verify an older version is fully blocked, the required-update screen has no dismissal path, update installs the exact latest stable tag, preserves the prior install, restarts on the same port/workspace, and unblocks only after `/api/health` reports the release version. Simulate GitHub/network and install failures; verify the workspace remains blocked and a failed replacement restores the previous install where possible.
- [ ] Verify a source checkout is exempt and is never overwritten by the managed updater; verify update checks disclose only version metadata to GitHub.
- [ ] Verify autonomous Build continues after browser disconnect, the Pause action stops after a safe boundary, process restart shows a resume prompt, and continuation re-checks workspace state without repeating verified milestones or bypassing tool-access gates.
- [ ] Verify protected paths such as `.env` are refused and a hostile cross-origin `POST` is rejected.
- [ ] Verify an email or wallet request produces a review card and cannot send/broadcast before the explicit confirmation click.
- [ ] Confirm no API keys, OAuth tokens, seed phrases, backup files, `.sonderr/`, or personal test data are staged.
- [ ] Review `git diff --check`, `git status --short`, `SECURITY.md`, public docs, version labels, and release notes.

## Release decision

Do not publish if a critical safety check fails, an external action can skip its confirmation boundary, credentials appear in output, or the app is reachable outside localhost. Record any known non-critical limitation in the release notes.

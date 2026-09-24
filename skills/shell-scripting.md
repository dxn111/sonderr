---
id: shell-scripting
name: Shell scripting & CLI
category: Engineering
icon: ❯
triggers: shell, bash, script, cli, command line, terminal, zsh, cron, makefile, argument parsing, exit code
summary: Write shell scripts that are safe by default — quoting, exit codes, and idempotence handled.
---
## When to use
- Writing or fixing bash/sh scripts, Makefiles, CLI entry points, or cron jobs.
- Scripts that work interactively but break in CI/cron.

## Approach
Shell is unforgiving: one unquoted variable or unchecked exit code turns a script into a footgun. Treat every script as if it will run with hostile input, on a different machine, at 3am with nobody watching.

## Steps
1. Start every script with `set -euo pipefail` so errors surface instead of cascading.
2. Quote every variable expansion (`"$var"`), especially paths — spaces and globs are the classic breakage.
3. Parse arguments explicitly (flags with defaults), print usage on error, exit non-zero on failure.
4. Prefer absolute or script-relative paths (`cd "$(dirname "$0")"`) — cron and CI run from elsewhere.
5. Check tool availability up front (`command -v jq || exit 1`).
6. Make destructive steps explicit and idempotent (`mkdir -p`, guard deletes, no `rm -rf` on computed paths).
7. Echo progress to stderr, keep stdout clean for actual output/piping.

## Pitfalls
- `rm -rf "$DIR/"` where DIR is empty or unset — always test-guard deletions.
- Parsing `ls` output; use globs or `find -print0` instead.
- Scripts that only work from one cwd or require interactive input nobody can give in cron.

## Verify
- Run the script twice (idempotence), with a path containing spaces, and with a failing intermediate step.

---
id: python-tooling
name: Python tooling & testing
category: Backend
icon: ρ
triggers: python, pip, pytest, venv, virtualenv, poetry, requirements, pylint, flake8, mypy, packaging, import error, module not found
summary: Clean Python projects — isolated environments, pinned deps, tests that actually run anywhere.
---
## When to use
- Setting up, fixing, or testing Python projects and environments.
- Import errors, dependency conflicts, "works in my venv" mysteries.

## Approach
Environment reproducibility is the foundation: every problem statement starts with "which interpreter, which environment, which versions". Tests are the product's contract — they must run green from a clean checkout with one command.

## Steps
1. Identify the exact interpreter and environment first (`which python`, `pip -V`) — half of all "bugs" are wrong-env installs.
2. One venv per project; install with the same command documented in the README; pin versions in requirements/pyproject.
3. Structure imports as packages (no sys.path hacks); keep `__init__.py` files consistent.
4. Tests with pytest: one behavior per test, fixtures for setup, tmp_path for filesystem, no network unless mocked.
5. Type-check (mypy) and lint (ruff/flake8) in CI — they catch the class of bugs tests miss.
6. Make `pytest` pass from a clean clone; any manual step means packaging is broken.
7. For packaging: `python -m build`, then install the wheel in a fresh venv and smoke-test the entry point.

## Pitfalls
- Installing with system pip instead of the venv's pip.
- Tests depending on execution order, machine state, or network.
- `requirements.txt` without pinned versions.

## Verify
- Fresh venv + install + pytest green, run twice; `python -m <module>` entry point works.

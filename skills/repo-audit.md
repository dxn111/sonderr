---
id: repo-audit
name: Repository audit
category: Engineering
icon: ◎
triggers: audit, architecture, codebase, code base, structure, project layout, onboarding, entry point, how does this project, map the repo, overview, explore
summary: Map an unfamiliar codebase before changing it — structure, runtime, entry points, data flow, and risks.
---
## When to use
- First contact with an unfamiliar repository, or when the user asks how a project is organized.
- Before planning or building anything on top of a codebase not yet inspected in this session.

## Approach
Ground every claim in a file you actually read. An audit without file paths is opinion, not evidence. Start broad (tree, manifests), then narrow to the modules that carry the core behavior.

## Steps
1. Read the project tree and manifests (package.json, requirements.txt, go.mod) to identify language, framework, scripts, and dependencies.
2. Identify entry points (main, index, server bootstrap, bin scripts) and trace the startup path.
3. Follow one vertical slice end-to-end: request -> routing -> logic -> storage -> response.
4. Note configuration, environment variables, and data boundaries (files, databases, external APIs).
5. List risks: dead code, stale docs, missing tests, unsafe defaults, fragile coupling.
6. Deliver a compact map: entry points, module responsibilities, data flow, then a prioritized risk list with file paths.

## Pitfalls
- Reading every file instead of following the main flow; the tree plus manifests tell you where to look.
- Asserting framework behavior from memory instead of checking the installed version.
- Describing data flow you have not traced through at least one real call path.

## Verify
- Every finding cites a file path you read.
- A newcomer could reconstruct the architecture from your summary alone.

---
id: project-scaffolding
name: Project scaffolding
category: Engineering
icon: ◫
triggers: scaffold, starter project, bootstrap project, new project, create app, project template, starter app
summary: Create a small, runnable project foundation with intentional structure and a verified first run.
---
## Workflow
1. Clarify the runtime, target platform, core user flow, and the smallest first deliverable.
2. Inspect the workspace for an existing project before adding a second structure.
3. Create a minimal manifest, entry point, source layout, readme, and ignore file appropriate to the stack.
4. Prefer established defaults over a bespoke framework layer.
5. Run the project’s install/check/start path and fix the first real failure before calling it scaffolded.

## Guardrails
- Do not install unknown packages or start a dev server without the user’s requested scope and permission.
- Avoid credentials, production endpoints, and hidden telemetry in a starter.
- Keep generated assets and build output out of source control unless the stack requires them.

## Verify
- A newcomer can run the project using the README.
- The first user flow has a meaningful smoke check.
- The tree has no empty ceremonial folders or unused abstraction layers.

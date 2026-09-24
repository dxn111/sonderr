---
id: documentation-maintenance
name: Documentation maintenance
category: Product
icon: ▤
triggers: update docs, documentation update, docs drift, handbook, user guide, api docs, maintain docs
summary: Keep public documentation accurate, navigable, and aligned with verified behavior.
---
## Workflow
1. Identify the public audience and the exact product behavior being documented.
2. Inspect the implementation and test the described path before writing claims.
3. Put setup, permissions, limitations, failure modes, and safety boundaries near the action they affect.
4. Link related pages, use stable headings, and avoid copying stale internal implementation detail.
5. Review for absolute claims, outdated versions, broken routes, and accidental secret or personal-data examples.

## Verify
- Every setup step works in a fresh local run.
- The docs name the current version and product terms consistently.
- The page renders without console errors or missing local assets.

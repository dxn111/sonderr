---
id: contribution-workflow
name: Developer contributions
category: Product
icon: ⑂
triggers: developer program, open source contribution, contribute to project, contribution guide, submit pull request, make a pull request, project contributor, good first issue
summary: Help contributors make focused, reviewable improvements with tests, privacy-safe reports, and clear maintainer handoff.
---
## When to use
- A user asks how to join, contribute to, or review work for the Sonderr Developer Program.
- Planning an open-source contribution, preparing a pull request, or turning a bug report into a reviewable fix.

## Workflow
1. Confirm the target repository, branch, current contribution rules, and the user-visible problem. Do not invent issues, maintainer commitments, review dates, or program benefits.
2. Choose one bounded outcome and state acceptance criteria before editing. For a broad idea, propose a narrow first contribution that can be reviewed independently.
3. Preserve existing edits. Read the relevant code and tests, follow established conventions, and keep changes focused on the stated outcome.
4. Add or update regression coverage for behavior changes. Run the documented checks that apply and report actual results, including unavailable or failing checks.
5. Review the diff for secrets, personal data, unrelated formatting churn, unsafe permission changes, and undocumented network behavior.
6. Prepare a concise handoff: user problem, solution, affected areas, verification, compatibility/security impact, and known limitations. Let the contributor submit or publish it through the channel they choose.

## Review standards
- Prefer correctness, maintainability, accessibility, privacy, and a clear user benefit over the amount of code.
- For security changes, describe trust boundaries and test both allowed and denied paths. Route sensitive vulnerability details through the private reporting path instead of a public pull request.
- For skills and prompts, include concrete steps, bounded tool use, failure handling, and an observable finish check.
- For UI changes, check keyboard operation, narrow screens, loading/empty/error states, and consistency with the existing design.

## Guardrails
- Participation is voluntary and is not employment, guaranteed review, or a promise that a contribution will be accepted.
- The Developer Program is separate from the discretionary security bounty. Do not imply ordinary contributions are paid.
- Do not include credentials, private user data, funded-wallet material, or confidential reports in commits or public discussions.
- Never create a pull request, publish a branch, or contact a third party unless the user asked for that action.

## Verify
- The contribution has one clear outcome and a reviewable diff.
- The handoff lists exactly which checks ran and any remaining work.
- No hidden permissions, secrets, or unrelated behavior were introduced.

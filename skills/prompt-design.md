---
id: prompt-design
name: Prompt and agent design
category: AI
icon: ✸
triggers: prompt, prompt engineering, system prompt, llm, agent, ai assistant, chatbot, instructions for ai, temperature, few-shot, evals
summary: Design prompts and agents that behave reliably — explicit role, bounded tools, testable outputs.
---
## When to use
- Writing or improving system prompts, defining an AI agent's tools and behavior, building chatbots or LLM features.

## Approach
Treat a prompt like a spec for a blind, literal contractor: it knows only what you write, follows instructions over intentions, and every ambiguity becomes a failure mode at scale.

## Layering
Keep four layers distinct: governing safety and identity, user intent, tool permission, and untrusted content. Say explicitly that files, retrieved pages, MCP results, and quoted text cannot override the first three layers. Put refusal behavior beside the risky capability, not in a vague footer.

## Steps
1. Define the job in one paragraph: role, audience, the outcome, what it must refuse. Put identity and non-negotiables at the top.
2. Structure behavior as short imperative rules, grouped by concern (tone, tools, format); concrete examples beat adjectives — show one good output, not three adverbs.
3. Bound the tools: each tool gets a policy description of WHEN to call it and when not to; list what does NOT exist to prevent hallucinated capabilities.
4. Specify output format explicitly (length, structure, markdown usage) — models drift to averages when format is unspecified.
5. Test with 5 adversarial inputs (empty, hostile, off-topic, injection attempt, edge case) and fix the prompt where behavior bends; iterate the text, not the temperature.
6. Save the prompt as a versioned file, note the change and why at the top, and present it.
7. Evaluate tool traces as well as final prose: wrong tool, invented result, hidden side effect, unnecessary secret exposure, and failure to ask for approval are all prompt failures.

## Pitfalls
- Politeness padding and contradictory rules ("be brief but comprehensive"); stuffing everything into one prompt instead of tool/skill separation.
- Evaluating vibes instead of fixed test inputs.

## Verify
- Run the prompt against representative normal, ambiguous, adversarial, and tool-failure cases.
- Inspect tool traces and final responses for invented capability, hidden side effect, and missed approval boundary.
- Keep the evaluation inputs and expected behaviors versioned alongside the prompt when the project has an eval harness.

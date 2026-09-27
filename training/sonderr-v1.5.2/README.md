# Sonderr model fine-tuning dataset (v0.1.0 seed)

**Product snapshot:** Sonderr v1.5.2
**Owner and maintainer attribution:** DXN1 / Sonderr team (provided by project owner for this dataset; not a claim about a separate legal entity).
**Source commit:** see `manifest.json`.

This is a source-grounded starter corpus for adapting an existing 400M–1B model to Sonderr. It teaches English interaction, Sonderr identity, mode behavior, skill selection, tool selection and argument shapes, wallet concepts, honest reporting, privacy, and explicit confirmation boundaries.

## Files

- `train.jsonl`: illustrative supervised examples with user turns, assistant responses, and/or canonical structured tool calls.
- `validation.jsonl`: distinct development examples; keep separate from gradient updates.
- `eval.jsonl`: held-out behavior requirements for regression evaluation; do not train on these prompts.
- `skills.jsonl`: all 61 canonical playbooks with metadata and full instructions, for retrieval/indexing or carefully curated distillation.
- `skill_comprehension.jsonl`: one concise Q/A record per skill. Validate these summaries against the playbook before using as target labels.
- `tool_schemas.json`: machine-exported canonical schemas from `server/provider.js`: 45 normal tools and one Vision-only tool.
- `tool_index.json`: compact searchable tool catalog.
- `manifest.json`: versions, counts, ownership attribution, provenance, and cautions.

## Suggested use

1. Start from a capable pretrained base model; this corpus alone cannot teach general English fluency. Use continued pretraining or a broad high-quality English instruction corpus as appropriate, then use Sonderr-specific supervised fine-tuning and preference/behavior optimization.
2. Normalize dialogues and tool calls to the exact chat template expected by the chosen model. `tool_calls` here are structured labels; adapt them to the base model's native function-call format rather than training it to emit ad hoc JSON in prose.
3. Use `train.jsonl` for initial SFT. Use `validation.jsonl` for checkpoint selection. Keep `eval.jsonl` untouched for final regression.
4. Treat the 61 Markdown playbooks as authoritative long-form reference data. A 400M–1B model is unlikely to memorize and execute every long skill perfectly from a tiny SFT set; teach skill retrieval and decision rules, and keep full playbooks available at inference time.
5. Generate many paraphrased, contrastive, multi-turn examples from source-grounded scenarios; include positive and negative tool-use cases, malformed/ambiguous requests, all network families, mode restrictions, provider failures, and user correction/resumption. Deduplicate near-identical examples and check train/eval leakage.
6. Re-export schemas and skills whenever the product changes. Tool availability is versioned; never leave stale tools in training labels.

## Product rules captured

- Modes: Ask (direct answer and grounded reads when needed), Plan (proposal without file changes), Build (scoped tool execution, todo/checkpoint, honest verification), Vision (image understanding; only `edit_image` tool).
- Skills: project playbooks are guidance, not tools and not permission. Relevant playbooks should be selected/loaded before specialist work; at most two auto-attach in this version.
- Tools: select only from the exact catalog; use exact names and schema; inspect before editing; verify claims with actual results; discover MCP schemas before calling remote tools.
- Wallet: separate EVM and Solana wallet families; exact network and contract/mint identity matters; testnet assets are valueless; private keys never enter the model context; reads are evidence with coverage/recency limits.
- Wallet actions: transfers/swaps are staged review cards. No signing/broadcast from model output. Only an exact user click in the local UI confirms. ERC-20 approval is separate from a swap; fresh quote and second confirmation follow. Swaps are direct one-hop Uniswap V3 on Base/Ethereum mainnet only, at most 1% slippage, and never imply profit.
- English: plain, natural, complete, concise when appropriate; preserve uncertainty, ask targeted clarifying questions when material details are missing, and never claim actions or checks that did not happen.

## Important limits

This starter has 37 illustrative training conversations, 5 validation examples, 12 held-out evaluation scenarios, and 61 playbook records. It is **not** enough data to deliver “perfect” skill mastery, broad English fluency, robust tool-use competence, or production readiness. Treat it as a verified seed and schema, then expand and evaluate substantially. A 400M–1B model can be Sonderr-specialized while remaining English-capable only if its base already has strong English representation and broad language behavior is preserved during tuning.

The runtime, not the model, is authoritative for permissions, tool schemas, path checks, access settings, external integrations, and transaction/email confirmation. Fine-tuning should improve proposals and tool use; it must not replace enforcement.

# SONDERR v1.5.2

![Sonderr 1.5 banner](https://github.com/user-attachments/assets/ef409eb2-a776-4a4b-a9bc-4413ab47a0e0)

<p align="center">
  <strong>Privacy-first AI workspace with Web3 capabilities.</strong>
  <br />
  Install locally in one command. Work from localhost.
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#availability">Availability</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#web-workspace">Web workspace</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#development">Development</a>
</p>

---

## Install

Requirements: Node.js 20 or newer, npm, and Git.

```bash
curl -fsSL https://raw.githubusercontent.com/dxn111/sonderr/main/install.sh | sh
```

The installer downloads the latest `main` source, installs it under `~/.local/share/sonderr-v1.5`, and links the `sonderr-1.5` command under `~/.local/bin`. It never uses `sudo` and refuses to overwrite an existing install directory or command. Review [`install.sh`](install.sh) before running it if you want to inspect the installer first.

Then start Sonderr with:

```bash
sonderr-1.5
```

If `~/.local/bin` is not already on your `PATH`, add it as the installer instructs and open a new terminal.

## Overview

Sonderr v1.5.2 is a privacy-first local AI workspace for serious software-engineering workflows, with optional Web3 wallet capabilities. Engineering is the core product; Web3 is an opt-in toolset, not the whole story.

The terminal is only the launcher.

The Sonderr experience lives in a browser tab served from your machine:

`sonderr-1.5` → local runtime → `http://127.0.0.1:4173`

There is intentionally no separate "AI CLI" experience in v1.5. The launcher starts the localhost application; the web interface is the product surface.

## Availability

Sonderr's source and self-service installer are available from the public repository. The installer tracks the latest `main` branch and installs dependencies from the lockfile; it is not a signed release package. Check the repository and review the installer before running it. Repository and release visibility are controlled separately from product support and availability.

## How it works

```text
┌─────────────────────────┐
│   sonderr-1.5           │
│   local launcher        │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Local Node runtime    │
│   localhost HTTP server │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Sonderr Web Workspace │
│   http://127.0.0.1:...  │
└─────────────────────────┘
```

Sonderr starts on port `4173` and automatically opens the browser. If that port is busy, it moves to the next available local port.

Manual launch without automatic browser opening:

```bash
sonderr-1.5 --no-open
```

Custom port:

```bash
sonderr-1.5 --port 4300
```

## Web workspace

The v1.5 web surface is intentionally closer to a modern AI harness than a traditional developer console:

- clean white workspace
- Sonderr blue interaction accents
- persistent workspace sidebar
- recent sessions area
- local runtime status
- central task surface
- composer for engineering tasks
- Sonderr otter branding throughout

The UI is designed so the runtime can grow into tool execution, repository context, provider routing, verification, and longer-running agent workflows without changing the core product shape.

## Architecture

Sonderr v1.5 separates the launcher from the actual product:

### Launcher

The `sonderr-1.5` command only starts the local runtime; it does not provide a separate AI CLI.

### Local runtime

A small Node HTTP server hosts the web application and local API endpoints.

### Web workspace

The browser is the primary interface. This is where sessions, tasks, model configuration, tool activity, diffs, logs, and project context can evolve.

### Agent layer

The agent layer connects configured model providers to workspace and integration tools behind the web surface. It remains separate from the launcher so the terminal command only starts the local runtime.

### Skills and tools (backend)

Skills are expert playbooks stored as markdown files in `skills/` — one file per skill, no UI required. The harness reads them at startup, auto-attaches at most two relevant playbooks for the current task, and exposes the directory so Sonderr can load another relevant playbook on demand. The 61 playbooks cover engineering, data, product, security, quality, Web3, and operations, including a dedicated faucet-claim workflow, a complete Sonderr product guide, wallet research, and Web3 earning.

### Workspace intelligence and controlled actions

Sonderr can build an evidence-based workspace map, read bounded line ranges, make an exact in-place patch, and run only existing project checks. Every filesystem action remains workspace-scoped; changes require the active execution mode, and project checks require both `full_pc` mode and an explicit verification request. The composer also offers `/audit`, `/health`, `/plan`, `/verify`, `/security`, and `/docs` shortcuts for the most useful workflows.

Tools including `analyze_workspace`, `read_workspace_range`, `patch_workspace_file`, `run_project_checks`, `list_workspace_files`, `read_workspace_file`, `write_workspace_file`, `search_workspace`, `run_terminal_command`, `load_skill`, `todo_write`, `todo_read`, and `present_file` run server-side with access levels controlled in Settings → Tools & Access. Tool calls stream to the chat as collapsed activity blocks in real time and are persisted with the session, so reopening a task replays them.

### File delivery and uploads (v1.5.1)

When the model finishes a deliverable it calls `present_file`, and the chat renders a download card served by `/api/download` (workspace-sandboxed, traversal-blocked, inline mode for image previews). Users can send work the other way too: the + menu has **Upload from device**, which stores files under `.sonderr/uploads/<session>/` with name de-duplication and a 20 MB cap. Text files attach to the message as context; images switch Sonderr into Vision mode automatically. Files can also be pasted from the clipboard or dragged anywhere onto the window — a drop overlay confirms the drop zone, images route to Vision, binaries attach as readable references instead of garbled context.

### Artifact panel (v1.5.1)

File output works the way Claude users expect. Every finished file lands in the chat as a clean artifact card — type icon in a soft-blue tile (or an image thumbnail), the file's title, and a `kind · size` meta line, with copy/download actions appearing on hover. Clicking the card opens the **artifact panel**: a side column that slides in beside the chat (full-screen on mobile) with a header (icon, name, `kind · size`, Copy, Download, Close) and a live preview body — rendered markdown, syntax-styled code/text, pretty-printed JSON, CSV/TSV as a real table (first 100 rows), full-bleed images on a checkerboard, and a download-first empty state for binary types like PDF/ZIP. Files that are too large to preview fall back to the same download-first state. ESC closes; the layout returns to the full-width chat.

### Vision mode (v1.5.1)

The composer's fourth mode — Ask / Plan / Build / **Vision** — is dedicated to image understanding. Model discovery tags every model with a vision-capability heuristic, the picker filters to image-input models only (auto-switching if the active model can't see), and attached images travel to the provider as OpenAI-style `image_url` content parts. The mode has its own system prompt (OCR, screenshots, charts, error debugging) and a single focused tool: `edit_image` — text-to-image via `/images/generations` or image-to-image via a multipart `/images/edits` call, with the finished PNG saved into `.sonderr/generated/` and auto-presented as a download card.

### Live task lists (todo system)

Multi-step work gets a visible task list. The model creates and maintains it with `todo_write` — one `in_progress` item at a time, marked completed the moment each step is verified — and the UI renders it as a live card: progress bar, per-item status icons (checkmark / spinner / ring), and priority badges. Updates stream over SSE as `todo_update` events, persist with the session, and replay when a task is reopened. The system prompt carries the full todo policy, so models know when to create the list and how to keep it honest.

### Long-running work and recovery (v1.5.2)

Substantial Build work has a durable `task_checkpoint_write` resume point with the goal, current milestone, verified evidence, decisions, and one exact next action. Long provider conversations are automatically compacted when they grow too large: Sonderr carries forward the original request, recent activity, and latest checkpoint while dropping bulky old tool outputs and image payloads. Summaries and checkpoints are untrusted hints; the model must re-check current files and results. At each active-hour boundary, Sonderr rechecks progress against the original request and evidence; the time budget is never a quota, and the agent should stop rather than invent work when the goal is met or useful work runs out. For exceptionally long jobs it can also keep concise private per-task notes (up to 16 notes, 12 KB each), stored locally with restrictive permissions and never included in chat-card events. Those notes are removed when the task is verified complete or expire after 30 days.

The local process can continue checkpointed work through bounded provider chunks after the browser closes; reconnecting shows progress. If Sonderr itself exits, the next launch marks the task interrupted and offers a **Resume interrupted task** action. S1-S4 targets are 10–60 seconds, H1-H4 are 5–20 minutes, and U1-U10 are 6–30 hours of active work; idle time and process downtime never count. Each provider chunk is capped at 24 rounds/80 tool calls, and a run is capped by its tier (up to 260 chunks and 1,500 tool calls). These are workload targets, not guarantees the provider, network, or computer will stay available for the full window. Configured permission and confirmation gates remain in force.

### Direct email (bounded)

The optional **Direct email** settings use SMTP without an MCP connector. Choose a Brevo, Mailgun, or SendGrid preset to fill the host and port, then provide a verified sender and credential from that provider. Headless deployments can use `SONDERR_EMAIL_PROVIDER`, `SONDERR_EMAIL_USERNAME`, `SONDERR_EMAIL_FROM`, and `SONDERR_EMAIL_PASSWORD`; the preset never creates a provider account or invents credentials. Passwords are kept in `~/.sonderr/.env` with restrictive permissions.

Every message goes through the `email-safety` skill and the visible confirmation card, with one exception: the single welcome message explicitly enabled during first-launch onboarding uses a short name-personalized preset that still identifies Sonderr as an AI assistant and includes the [project repository](https://github.com/dxn111/sonderr) and [contact/complaints link](https://x.com/Dxn1_0day). The send layer enforces one message per second, ten recipients per message, and one hundred per hour, and appends the same identity details to ordinary outbound bodies.

Gmail OAuth is available in the same panel. Create a Google **Desktop** OAuth client, save its client ID in Settings (or `SONDERR_GMAIL_CLIENT_ID`), choose **Connect Gmail**, and complete Google's consent window. Sonderr stores only the refresh token in the protected local `.env` file and uses the `gmail.send` scope; it does not store a Gmail password.

### Local wallet (no connector)

Settings → Wallet can generate a local EVM wallet and a separate Solana wallet without a browser extension or wallet connector. The first-launch wallet opt-in creates a default Base/EVM wallet automatically, with no RPC URL/key setup. Built-in profiles cover Base Mainnet, Ethereum Mainnet, Base Sepolia, Ethereum Sepolia, Solana Mainnet, Solana Devnet, and Solana Testnet; choose the active profile in Settings → Wallet. The same EVM address works on Base/Ethereum mainnets and both EVM testnets, each with an isolated balance; one Solana address is reused across clusters, also with isolated balances. Devnet/testnet tokens have no real-world value and no market price. A failed or unsupported network never falls back to mainnet. ETH and ERC-20s (including USDT and memecoins by exact contract) use the EVM address; SOL/SPL assets use the separate Solana address, with derived associated token accounts per exact mint. `get_wallet_accounts` lists generated addresses and native balances across these networks, while `get_wallet_portfolio` can inspect one exact network. Sonderr supplies built-in public RPC transport and makes network calls from its local wallet runtime; public addresses are disclosed to the selected RPC/index/price services, but local keys are not. Download an encrypted password-protected backup for each wallet before funding. Every transfer first creates a visible chat review card with chain/network, sender, recipient, exact token address/mint, base-unit amount, call/instruction summary, estimated gas/fee, and expiry. Nothing is signed or broadcast until the user presses **Accept & send** on that exact card; **Decline** invalidates the pending draft. Trading is now direct Uniswap V3 on Ethereum/Base mainnet: Sonderr reads exact token metadata, factory pools and pool liquidity, and compares QuoterV2 output for each supported direct-pool fee tier through the selected chain RPC. It does not call LI.FI or any hosted quote/route/market API for trading. The review card shows the chosen pool, fees, quoted and minimum output, price-impact estimate, router, gas cap, and expiry. Only **Accept & swap** on that exact card broadcasts; missing ERC-20 allowance creates a separate exact-amount approval card, and approval never performs the swap. A fresh quote and separate click are required afterward. This is direct-pool-only, no multi-hop or fallback venue, no auto-trading, leverage, or profit promises. RPC nodes and Uniswap contracts are still external blockchain infrastructure; keys stay local.

Address model: ETH and every ERC-20/memecoin on one EVM network use the same `0x…` wallet address; the token contract identifies the asset. SOL and SPL/memecoins use one Solana wallet address, with a derived associated token account for each mint. The review card shows those token accounts when applicable. EVM and Solana wallet addresses are different because they are different chains.

Wallet read tools include `get_wallet_accounts` (all generated chain addresses and per-network native balances), `get_wallet_status` (one network's address and native balance), `get_wallet_price` (cached/live USD price and 24-hour movement for a native asset or exact token contract/mint), `get_wallet_market_snapshot` (reported DEX pools, liquidity, volume, spot prices, and changes for an exact mainnet token), `get_wallet_token_allowance` (read-only ERC-20 allowance for one exact token+spender), `get_wallet_portfolio` (native/token balances, total USD value, and change since the last local snapshot on the selected network), `get_wallet_token_info` (exact token metadata, supply, balance, plus Solana mint/freeze authorities), and `get_wallet_activity` (recent public chain entries with explorer links). Optional incoming-funds watching can be enabled in Settings → Wallet or explicitly through chat; it samples native and discovered token balances about once a minute while Sonderr runs and keeps a short local event history. It reports observed net increases, not payment confirmations. Poll gaps, unindexed assets, public endpoint outages, or rate limits can hide deposits, so verify important receipts on-chain. Read-only market/indexer tools may disclose wallet/token identifiers to their providers. Direct Uniswap swap preparation instead uses the configured RPC and discloses the selected wallet, token contracts, and amount to the RPC/node; local private keys are not sent. Market feeds and prices are incomplete estimates and never prove a token is safe. Swap cards always need explicit user confirmation; Sonderr never executes unattended or recurring trades.

Wallet safety note: Sonderr Wallet is experimental and is not recommended as a primary wallet. Keep no more than €100 total (or equivalent) in it while testing, back up the encrypted wallet, and assume bugs or user mistakes can permanently lose funds. This is a recommendation, not a technical guarantee or a promise of reimbursement.

## Development

Requirements:

- Node.js 20+
- Git for source development

For source development, run the local workspace directly:

```bash
node bin/sonderr-1.5.js
```

Or through npm:

```bash
npm run start
```

Validate the launcher:

```bash
npm run check
```

## Current scope

Sonderr v1.5.2 provides a localhost engineering workspace with these capabilities:

- local installation and one-command launch
- localhost serving with automatic browser opening
- provider-agnostic model discovery and ranking, with vision-capability flags
- server-side tool execution with approval levels
- live task lists (todo system) streamed and persisted
- present_file artifact cards with the Claude-style side preview panel (markdown / code / JSON / CSV / images)
- device uploads (20 MB, sandboxed) plus clipboard paste and drag & drop
- Vision mode: image Q&A over vision-capable models + edit_image generation/editing
- 61 handwritten backend skill playbooks with up to two relevant skills auto-attached per task
- persistent task lists and resumable active-work quality budgets for multi-stage tasks
- workspace analysis, bounded source reading, exact file patching, and controlled project checks
- a long-running task workflow that checkpoints progress and resumes from verified workspace state
- system prompt with explicit tool contracts, untrusted-content handling, privacy boundaries, and honest verification rules
- Sonderr branding, clean AI-harness-style UI

## License

MIT License

---

<p align="center">
  <strong>Local-first by design. Build in the browser.</strong>
</p>

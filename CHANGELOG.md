# Changelog

## v1.7.3 — The stop update (one automatic workflow, a real Stop button, faster tool calling)

### One automatic workflow — Ask, Plan, Build, and Vision are now one
- The mode picker is gone. The composer shows a single **Auto** chip: Sonderr answers simple questions directly, plans when you ask for a plan, builds when you ask for work, and handles images automatically — no mode to switch, ever (the Claude pattern). Attaching an image routes the turn through vision automatically, and the model menu prioritizes vision-capable models whenever an image is attached.
- Legacy modes still work through the API for older clients; internal read-only contexts (the built-in docs assistant, team rooms, helper runs) keep their boundaries. The real permission gate was always Tools & Access, and it stays exactly as strict as before.
- Every tool-gate error was rewritten to be mode-agnostic — nothing tells you to "switch modes" anymore.

### A real Stop button
- While Sonderr works, the send button becomes a **Stop button** (square glyph, Esc works too — unless a modal has focus). Stopping aborts the live stream instantly and freezes the run UI at exactly what is on screen: running step cards flip to "Stopped", and an honest chip explains that the summary will appear in history.
- The server wraps the stopped turn up gracefully: one tool-less pass writes a brief honest summary of what was completed, verified, and what remains — saved to history even after the browser stopped listening. A persisted "Stopped · N steps done" chip renders in history too.
- The swarm honors Stop like every other work: workers that had not started are marked **skipped** (visible on the board with an amber dot and "Stopped · skipped" label), remaining phases are skipped, and the lead closes the room with what the team had gathered.

### Tool calling, fixed and faster
- **Parallel read-only rounds**: when one round asks for several strictly read-only tools (file reads, searches, wallet reads, MCP reads, web research), they now run concurrently instead of one-by-one. Any round containing a side-effect tool stays strictly sequential, so mutations can never race.
- **Malformed-argument repair**: providers occasionally emit truncated or invalid tool-call JSON. One cheap structural repair (balance braces, drop trailing commas, escape raw control characters in strings) now saves the step instead of failing the call and burning a whole provider round on self-correction.
- **Narration rides with the tools**: the workflow prompt now instructs narration to be emitted in the same response as the next tool calls — never a whole round spent on narration alone, which was a hidden round-trip tax on every multi-step task. Independent read-only lookups are batched into one response.

### Latency, made visible
- The worked chip now reports **first-token latency** ("Worked for 42s · 7 steps · first token 1.8s") so slow providers are visible instead of mysterious.

### The official docs, one click away
- The app now links to the official DXN1 Studios docs site — **[dxn1-docs.vercel.app](https://dxn1-docs.vercel.app)** — from the topbar (Docs), the welcome screen, the built-in handbook, and the Release Center. `/docs/online` redirects straight there; the local handbook keeps covering the essentials offline.

## v1.7.2 — The swarm update (a live mission board for the AI team, Claude-grade plan + recovery)

### The swarm, top tier
- The inline team card is rebuilt into a live mission board. The title now tells the story in real time — "Team researching · 1/4 done" → "Cross-review underway · 2/4 reviewed" → "Commander is synthesizing…" → "Team run complete · 42s" — and a three-segment phase tracker (Research / Cross-review / Synthesis) advances with the run, pulsing on the active phase.
- Every worker renders as a live row with its avatar, role, current activity, status dot, and an honest elapsed-time chip that ticks once per second while the run is live. Team signal counters (shared findings, teammates helped, risk flags with a high-risk alert tint, votes recorded) fill in as the team works.
- The lead's synthesis lands on the board itself as a verdict preview card when the run completes — no need to open the room to see where the evidence landed. The poll summary stays one click from the full room (Alt+5).
- The room modal gains the same phase tracker under its header, a live elapsed chip in the subtitle while the run is active, and upgraded roster cards showing per-worker elapsed time, token usage, and finding/review counts.

### A real room engine underneath
- Rooms now carry a coarse phase (research → review → synthesis → complete) plus honest timestamps: the room stamps startedAt/completedAt, and each worker's clock starts on its first research/review step and stops at completion or failure. The cross-review and synthesis transitions are announced on the lead's timeline in plain words ("First pass is in — the team is now cross-reviewing…"), so the board reads like a mission feed, not a status dump. Restored (archived) rooms backfill the complete phase so old runs render correctly.

### Workflow finesse, continued (Claude-grade)
- Spawning a team renders as a proper step card — "Spawn AI team · 4 workers · team poll" — whose running state mirrors the live team ("3 workers · Researching"), instead of an untitled raw tool name.
- The first narration before any tool call is labeled PLAN, matching Claude's plan-first pattern, live and in history.
- A failed step no longer silently returns to "Thinking…": the status line says what happened — "Recovering from read file failure — continuing the plan…" — Claude-style honest recovery.
- The workflow system prompt now tells the lead to treat the live board as the presentation layer: reference the strongest evidence, name disagreements, and lead with the synthesis instead of restating every worker's raw findings.

## v1.7.1 — The companion polish (a cuter otter, a Claude-grade spark, workflow finesse)

### The otter pet, rebuilt
- The screen companion was redrawn from scratch: rounder "baby" proportions, a bigger head with large glossy eyes that carry double highlights and now genuinely blink (periodic, staggered per eye), blush cheeks that pop when it is happy, small rounded ears with inner shading, a fluffy two-tone curl tail that sways, a glossy pebble on its belly, a chest fluff tuft, and layered water with soft ripples plus three twinkling star sparkles. Bigger on screen (118x92), crisp vector at every size, all states re-tuned: faster paddling while Sonderr works, a wiggle-and-blush celebration, a slow-drift nap with z's, and full `prefers-reduced-motion` support.

### The working animation is Claude-grade now
- The status line no longer runs a mascot scene. The otter swim scene is retired from the status line (the otter lives as the draggable pet only) and replaced with the Claude pattern: a small four-point spark in the brand gradient that gently pulses and sways beside the shimmer text. Minimal, calm, premium.

### Workflow finesse (researched against Claude, Grok, and GLM)
- The status text now crossfades into each new activity instead of hard-swapping.
- Finished tool cards de-emphasize (like Claude's past steps) and their icon chip picks up the state color: green when done, red when failed, blue-tinted while running.
- Workflow turns end with a Claude-style footer chip — "Worked for 12s · 4 steps" — summarizing the run at a glance.


## v1.7.0 — The workflow update (token streaming, live step cards, self-healing loop)

### Token-by-token streaming
- Responses now stream live as the model writes them, Claude-style: OpenAI-compatible SSE is parsed into the same completion shape (content, tool-call deltas reassembled by index, finish reason, usage), and text is pushed to the UI as throttled `delta` events (~90 ms batches). Deltas are live-only — they are never persisted into message events, so history stays lean; mid-loop narration is preserved separately as small `segment` events so reloads still show the story between tool cards.
- Bulletproof fallbacks, verified by tests: a gateway that ignores the stream flag and answers JSON is sniffed by content type and parsed directly (streaming remembered off for the rest of the turn, no wasted request); a provider that rejects `stream:true` with an HTTP 400 falls back to the classic path mid-turn; an unreadable streamed body retries once through the classic path. The local sonderr-v1 model keeps the classic path. The old 429/413/TPM/compaction machinery is untouched and fully re-verified.

### Live step cards and narration
- Every tool call renders as a Claude-style step card: a pulsing running state while it executes, a duration badge when it lands (e.g. "2.3s"), and the existing collapsible input/output body. The status line gains a step counter ("Step 3 · Reading files…") and a live elapsed timer chip.
- The workflow system prompt now asks the model to narrate one or two short sentences between tool rounds — what it learned, what it is doing next — so a run reads like a story instead of a silent file dump, and never to paste raw tool output into the reply.

### The self-healing loop
- A mid-loop provider failure no longer kills the turn ("lists files then dies" is fixed). The follow-up request retries once on a compacted conversation; if recovery is impossible, the turn ends with an honest progress summary built from the actual completed tool steps ("Completed read_workspace_file · index.html…"), marked incomplete so the checkpoint and conversation persist for resume.
- Hitting a safe limit no longer dead-ends with "say continue": the turn immediately writes a real handoff (what was verified, what remains, the exact next action) via a tool-less synthesis request, with the classic notice as fallback.
- Safe ceilings doubled: up to 40 tool→model rounds (was 24) and 120 tool calls (was 80) per user message.

### Announcements and docs
- New v1.7 launch announcement ("Watch Sonderr think. Literally.") with fresh key art, a v1.7 archive entry, an updated Release Center at /update with the workflow story, and version badges updated to v1.7.0.

## v1.6.2 — The companion update (otter pet, vector motion, bulletproofing)

### The otter pet
- Add a ChatGPT-style screen companion, specialized: an otter. It floats on its own little pool anywhere on the workspace — drag it anywhere (pointer events, clamped to the viewport), click to pet it for a burst of hearts, and watch its moods: it paddles energetically while Sonderr works, celebrates when a task list completes, and naps (with z's) after four quiet minutes. Toggle it from the new "Otter pet" sidebar item; the on/off choice, position, and lifetime pet count persist in local storage. The pet is a hand-built vector (crisp at every size), ships on by default for new sessions, and honors `prefers-reduced-motion`.
- The app now emits `sonderr:pet` events (`working`, `idle`, `celebrate`, `meet`) from the send flow and task-list rendering; the v1.6.2 announcement's "Meet the otter" button turns the pet on and throws a celebration.

### Working animation, rebuilt
- Replace the raster otter chip (a static PNG bobbing in a circle) with a hand-built vector swim scene: an otter gliding between two moving wave layers, tail flicking, bubbles rising — every part animates on smooth transform/opacity curves with proper easing. The status text gets a Claude-grade shimmer sweep. Both honor reduced-motion preferences.

### Bulletproofed workflow
- Empty final responses no longer render as a silent blank bubble: the turn ends with an honest inline notice explaining what happened and how to fix it.
- The chat handler refuses classifier/guard models in the chat slot server-side (mirroring the v1.6.1 picker filter): the turn ends immediately with an actionable explanation instead of streaming a verdict like "User Safety: safe" that reads like silence.
- The model picker flags any model whose id looks like a classifier with a "classifier" badge, and choosing one shows a heads-up toast.
- A stuck-stream watchdog: if a running turn produces no events for 75 seconds, the status line says so honestly ("Still working — the model is taking longer than usual…") instead of leaving an indefinite spinner. The watchdog timer is cleared on every exit path and can never leak.

### Announcements and docs
- New v1.6.2 launch announcement with generated pet key art; the v1.6.0 announcement moves to the announcements archive alongside the Sonderr-v1 film, and the Release Center at `/update` gains an "Otter pet" section with new generated art (pet scene and glide scene) plus the bulletproofing story.

### Internal
- Bump the application version to 1.6.2. New `test/companion.test.js` suite pins the pet/animation/bulletproofing wiring (22 test suites total); `npm test` runs it as part of the standard suite.

## v1.6.1 — The model picker fix

- Filter non-chat models out of model discovery so the chat picker only offers real conversation models. Guard and safety classifiers (Llama Guard, Qwen3Guard, ShieldGemma, Nemotron Content Safety, Aegis), moderation and toxicity models, embedders, rerankers, speech models, and image-generation models no longer appear in the dropdown. Previously, selecting a content-safety classifier made every message look unanswered — the model's verdict (for example "User Safety: safe") rendered as the whole reply, which read like Sonderr refusing to respond.
- Chat variants keep their place in the list: chat-tuned Nemotron instruct models, reasoning models, and every other conversation model are unaffected. The filter is a deterministic id-based heuristic (`isChatModel` in `server/provider.js`), exported for reuse and covered by its own test suite.

## v1.6.0 — The biggest update yet

### Announcements and visuals
- Every launch now opens with the Sonderr v1.6 announcement card (AI-generated key art, release highlights, and a direct link to the new Release Center); the Sonderr-v1 SLM film no longer interrupts startup and remains permanently available in the sidebar announcements archive.
- Add a dedicated Release Center page at `/update` — a standalone hub with the full v1.6 notes, security summary, Studios specialization showcase, and update instructions, linked from the launch announcement, the archive, and the README.
- Generate v1.6 art assets: key art with the otter companion, an otter mascot portrait, and Swarm 2.0 network art (`web/assets/sonderr-v16-*.png`), plus new Studios visuals — the Studios hero scene, the two-specialist crew art, and the four-craft board (`web/assets/sonderr-studios-*.png`).
- Add the otter companion: while Sonderr works — including through the final streamed response — the status line shows a gently swimming otter chip with a ripple animation and "Sonderr is working…" text, honoring reduced-motion preferences.
- Update the sidebar brand to v1.6.0 and refresh Studios branding to release-candidate status.

### Swarm 2.0
- Collaboration rooms support up to six read-only workers (previously three) drawn from sixteen personas across eight roles; Builders, Testers, Documenters, and Strategists join the roster, and saved rooms restore their full-sized rosters.
- The AI lead now ends every room with a published synthesis pass — a structured verdict separating agreement, contradictions or gaps, and up to three recommended next steps; a failed synthesis never blocks the room result.
- Raise collaboration ceilings: six shared findings per worker, four risk flags per worker (sixteen per room), twelve live help threads, a 160-entry transcript, and two anonymous helper calls per room.
- The synthesis entry renders in the Alt+5 agent room with a distinct "LEAD SYNTHESIS" style, and the room subtitle mentions the synthesis pass.

### Marathon workflow (S1–U10)
- Extend U-tier quality budgets to a 72-active-hour maximum (U1–U10 = 6, 8, 10, 12, 15, 18, 24, 30, 48, 72 hours); U7 and above are labeled multi-day engineering tasks, so a U10 can span one to three working days.
- Raise U-tier run limits to 80–350 bounded provider chunks to sustain marathon tasks.
- Restate authoritative time facts on every Build turn: humanized active-work duration (for example "1d 4h 20m"), remaining budget, task start time, and wall-clock span — with explicit instructions to treat these numbers as the only trustworthy clock and never estimate elapsed time from memory.
- Add marathon discipline rules: U-tier tasks keep every edit the size and care of an H1-H4 pass, must produce new evidence in every pass, and checkpoint an honest pause instead of idling, hallucinating progress, or manufacturing filler work.
- Update the long-running-work skill, quality_checkpoint schema text, and Build/Ask system prompts to match the 72-hour scale and the anti-idle, anti-hallucination rules.

### Task lists 2.0
- Todo items support an optional evidence `note`: the next concrete action for open items or the verifying evidence for completed ones, persisted through the store sanitizer and rendered inside the live task card.
- Todo guidance now requires milestone-sized items for multi-hour and U-tier tasks — each item an independently verifiable outcome sized like a complete H-tier slice.

### Studios
- Sonderr Studios graduates from beta to release-candidate branding across the sidebar and Studios home.
- Go specialized: add the Document Studio (print-ready PDFs and documents) and Design Studio (posters, brand systems, and design kits) alongside Website, App, Project, Developer, and Bounty studios — seven specialized starting points with track-specific milestones and canvas hints, plus a new generated craft board and Studios hero art.
- Add the Studio Crew: every real Studios work turn fields exactly two track-matched specialists (Site Architect + Interface Designer, App Engineer + Experience Designer, Document Architect + Page Designer, Design Lead + Craft Specialist, Project Planner + Build Specialist, Code Researcher + Contribution Guide, Scope Analyst + Safety Reviewer). The crew is phase-aware — plan, build, review, and advise turns hand each worker a different specific task for what needs to happen right now — the lead synthesizes both reports, and the lead — never a worker — performs all edits and checks. The studio rail shows the crew with their live phase chip, per-phase assignments, and a two-specialist phase art card, and the spawn_subagents tool is always supplied for Studios work turns.
- Add per-craft playbooks with a definition of done: each studio carries five professional rules (for example print-ready output for documents, mobile-first layouts and accessibility for websites, palette discipline and export completeness for design) that the lead applies while working and as the final acceptance check; the studio rail shows the craft standard chips and the definition of done inline.
- Add a "What the crew makes" showcase to the Studios home — generated deliverables flat-lay art (bound report, design posters, site on laptop and tablet) with the four output chips — plus new phase-aware crew art (two specialists advancing through plan, build, and review stages) and a cinematic v1.6 finale hero on the Release Center.
- Premium visual polish: animated aurora wash over the announcement hero, a rotating conic halo behind the working otter chip, shine sweeps on crew task chips and the announcement CTA, hover lift and glow on crew cards, craft chips, path cards, and hero art, and a sheen sweep on the deliverables showcase — all honoring reduced-motion preferences.

### Security
- Keep the fail-closed release gate, size-capped release metadata fetch, and timestamped update backups that anchor the managed-update flow; document the v1.6 posture on the Release Center.
- Swarm rooms remain strictly read-only for workers, and the synthesis verdict is labeled an AI assessment that never authorizes user actions.

### Internal
- Bump the application version to 1.6.0. The npm package name and `bin/sonderr-1.5.js` entrypoint intentionally stay unchanged so the managed one-click updater and install paths keep working for existing 1.5.x installs.

## v1.5.18 — Hardened local runtime

- Escape model and file content inside fenced markdown code blocks in the frontend renderer, closing a stored XSS path in the chat transcript and artifact previews.
- Randomize temporary file names for secret-store and session-data writes so symlink attacks cannot target predictable temp paths.
- Replace O_TRUNC with O_EXCL on temp file opens and add failure cleanup so partial writes cannot silently corrupt the data store.
- Back up corrupted data.json and credentials.json to timestamped .bak files before resetting, instead of silently dropping all sessions and settings.
- Fail-closed on platforms without fs.constants.O_NOFOLLOW instead of silently disabling symlink protection.
- Preserve existing temp-file safety patterns already used by the MCP config writer as the model for all other local-file writes.

## v1.5.17 — Safer tools, sharper teamwork

- Pin every public web request, including search fetches, to DNS answers already checked for public addresses; remove the unpinned fetch path that allowed DNS rebinding between validation and connection.
- Reject symlinks in workspace file tools and listings, and write edits through exclusive no-follow temporary files with destination rechecks before atomic replacement.
- Disable unbounded regular-expression workspace searches and cap literal searches by file count, directory depth, total bytes, and result count to protect local responsiveness.
- Start new chats and API requests in Build mode, remember the latest user or assistant mode when reopening a conversation, and give Sonderr-v1 workspace orientation tools by default while routing todo and quality tools to work that needs them. Keep simple Q&A natural without Build-mode task ceremony.
- Let short follow-ups reuse the immediately prior user topic for tool discovery while passing only the current message to execution guards, so chat continuity cannot act as permission.
- Route ordinary app, log, change-review, and task-continuation phrasing to the matching local workspace tools, including the focused Sonderr-v1 tool set.
- Keep direct team requests in the current chat, recognize requests such as “spawn three agents” or “research this with agents,” switch pure research to Ask while preserving Build for explicit code changes, and remove unrelated workspace tools when an underspecified request needs clarification.
- Distinguish log inspection from running project checks, while routing explicit “check that it works” requests to the verification tool.
- Route clearly time-sensitive questions about current versions, releases, prices, weather, policies, and public events to web sources.
- Give Sonderr-v1 the scoped edit and file-creation tools for natural requests such as “make an app” or “make the UI work,” while keeping generic questions out of the workspace flow.
- Keep general how-to questions such as “How do I build an app?” on a concise explanation path; workspace-specific questions still receive inspection tools.
- Keep Ask mode visibly read-only by omitting file-write, patch, and project-check schemas; Build mode plus the current edit request is required for workspace changes, and image creation requires Vision mode.
- Require a direct edit request in the current message before workspace writes or patches, and require a matching present-turn action for mutating MCP tools; earlier context may resolve file or tool selection but cannot authorize an edit.
- Require the current message to explicitly start or stop wallet watching before changing its persistent polling state.
- Keep Sonderr-v1's basic Build tool set focused on workspace orientation; expose quality checkpoints for edits and todo tracking for multi-step or substantial work.
- Omit local workspace schemas from ordinary or research-only Build turns, while preserving them for app, file, debugging, and implementation requests.
- Add a guarded retry for pre-tool provider failures, reusing the saved user turn and preserving attachments; never expose automatic retry after tool activity begins.
- Keep failed-request retries on the same visible user turn and preserve its mode, plugin, context, and image attachments; reject retries whose saved turn or attachment set no longer matches.
- Recover the exact saved user-turn ID after an early connection drop before offering a safe retry, avoiding duplicate transcript entries.
- Refuse any provider tool call that was not included in the active request schema, including after token-limit compaction, and require tool arguments to be JSON objects.
- Parse LF/CRLF event-stream frames and flush the UTF-8 decoder at EOF so the last chat event is not lost at a chunk boundary.
- Return bounded errors for failures during chat preparation before event streaming begins, instead of allowing the async request handler to reject without an HTTP response.
- Keep the task-mode selector accessible as a pressed-state control, with Build visibly selected on first launch.
- Announce newly added conversation turns and chat progress/errors to assistive technology through a polite live log and status regions.
- Keep short factual questions and greetings concise even though a new chat starts in Build; substantive workspace requests still receive Build tools and tracking.
- Isolate in-flight replies by conversation so switching chats cannot overwrite another session, release the wrong composer lock, or scroll the wrong transcript; keep recoverable provider failures attached to their original user turn.
- Guard session lists, Studio saves, checkpoint refreshes, workspace mentions, file uploads, and agent-room replies against late results from an earlier view.
- Include the owning conversation ID in every live team-room snapshot so delayed worker updates cannot be attributed to another open chat.
- Keep Trading research busy state separate from chat Build state so a background reply cannot unlock a busy composer after changing surfaces.
- Recalculate the active chat's busy state after loading its new surface, so a reply already running in the background stays visibly busy when returning from Trading.
- Reject workspace environment directories containing symlinks, and canonicalize configured environment paths before saving them.
- Pin HTTPS MCP requests to validated public DNS answers, reject redirects, and block IPv6 transition/special-use targets that can reach private networks.
- Create first-run session, credential, and MCP config files with exclusive no-follow opens so dangling links cannot redirect initialization writes.
- Use unique no-follow temporary files for MCP config replacement, and validate task-memory storage before changing directory permissions.
- Reject unsafe or credential-bearing remote links before rendering untrusted token-pool and transaction explorer URLs.
- Recheck saved MCP endpoint and subprocess environment settings at connection time, and reserve loader/runtime environment variables for Sonderr.
- Separate task mode from Tools & Access in model guidance and runtime authorization. Ask remains read-only, Plan remains mutation-limited, and Build/Vision actions now expose only schemas permitted by the selected access level.
- Enforce mutation task-mode checks at the server execution boundary for workspace edits, project scripts, local configuration, wallet actions, MCP calls, Studio updates, email drafts, and task-private state so a stale or indirect call cannot bypass schema filtering.
- Hide terminal and project-check schemas unless Full PC access is selected; require Build mode and explicit current-message verification intent before running project scripts.
- Keep Ask-mode read-only workspace and built-in public web tools usable, while keeping wallet and remote MCP reads behind their actual access setting; preserve the explicit Trading-page wallet-read exception.
- Give hosted and local Sonderr-v1 paths explicit, consistent Ask/Plan/Build/Vision capability guidance. Capability questions no longer use the stripped-down casual-answer prompt, and models are told not to offer an unnecessary mode switch or claim supplied tools are unavailable.
- Make runtime denial messages and tool schemas distinguish task mode, access level, and user intent. Refused actions are final for that route; models must state what did not happen and cannot retry via another tool or shell command.
- Correct the Tools & Access descriptions so they no longer promise a per-tool approval prompt or imply terminal/project checks are enabled outside Full PC access.
- Keep Studio board mutation schemas out of Ask, Plan, Vision, and Ask-before-tools requests even when Studio routing adds task-specific tools after base selection.
- Reapply task-mode and Tools & Access schema filtering after surface-specific tools are appended, closing late tool-injection gaps in Studio and Trading routes.
- Preserve the active mode, access, and safety rules in same-chat agent-team requests instead of replacing the normal system guidance with a swarm-only prompt.
- Require affirmative present-turn command intent before showing or running shell commands, including supplied/following script phrasing; route verification requests to the bounded project-check tool instead.
- Reject negated, hypothetical, or how-to phrasing at the execution boundary for workspace/Studio edits, local ledger writes, email draft creation, and image generation as well as terminal actions.
- Preserve a clarified network across short follow-ups for deterministic read-only wallet lookups; mutation authorization still receives only the current user message.

## v1.5.16 — Read-only AI swarm and verified Q4 install

- On compatible Linux x64 systems, install the SHA-256-verified Q4_0 GGUF model and bundled llama.cpp CPU runtime; retain the Transformers CPU install on other supported platforms.
- Improve focused skill loading and small-model tool selection for the local Sonderr-v1 route.


- Close workspace symlink aliases to protected data: file reads, file metadata, downloads, edits, and workspace search now reject links that resolve to `.env`, `.sonderr` control data, Git internals, or paths outside the workspace. Dangling symlinks are rejected before writes so they cannot redirect a new file outside the workspace.
- Apply canonical destination checks in addition to the user-supplied path check, preventing a harmless-looking alias from bypassing sensitive-path filtering.
- Constrain normal UI assets, documentation routes, and the fallback page to canonical files inside `web/`; malformed encodings and symlinks resolving outside that directory are rejected.
- Adds Kilo-compatible AI collaboration rooms: one accountable lead and up to three read-only worker calls, human-style fictional AI names/roles, a shared findings board, peer review, and a lead-authored poll with individual AI votes and totals.
- Improves worker evidence contracts and live activity labels; lead-assigned role hints and focused research/review instructions are carried into parallel calls.
- Adds clickable stock agent portraits with task profiles, live presence, model-reported token/throughput stats, and a human vote card directly in the shared room. Human votes remain separate from AI worker tallies.
- Gives workers scoped group-chat tools to ask for help, answer open teammate requests, and revise their current poll vote when new evidence changes their view.
- Adds a live team-board reader, optional directed peer-help requests, and evidence-backed risk/contradiction flags with bounded per-worker limits. Reviewers receive answered help threads and risk notes, then can verify them against their own evidence.
- Adds live team chat: users can message the whole room, ask the commander to consult up to two relevant workers, or direct a follow-up to one worker. Room replies are conversational, remain clearly AI-authored, stay read-only, and are saved back into the session.
- Adds a responsive room composer with recipient selection, keyboard send shortcuts, live reply state, and distinct styling for user messages and teammate replies.
- Lets users route a focused question straight to the single anonymous helper without creating a roster profile or persistent status; the commander can also request that bounded second opinion when useful.
- Rehydrates saved collaboration rooms after a local app restart, restores their named roster and transcript, and lets the room continue with the currently selected provider.
- Shows who a user message was sent to and adds visible teammate handoff activity when the commander checks a worker's evidence.
- Streams assignments, research activity, findings, cross-reviews, and votes into the chat, and adds a responsive Alt+5 room view with the team roster and poll breakdown. The UI labels workers as AI personas; votes never authorize user actions.


## v1.5.15 — Sonderr-v1 installs and works locally

- Adds an install prompt when Sonderr-v1 is selected but not yet available, with progress for verified model download and private CPU runtime setup. The cloud-hosted option is shown as disabled and Coming soon.
- Uses Kilo Gateway as the default provider on a new install. Sonderr-v1 stays a top-of-list local model choice under Kilo and routes locally without changing the selected provider.
- Downloads the published merged model into `~/.sonderr`, checks its official SHA-256 before extraction, and prepares a private CPU-only PyTorch and Transformers environment on first install.
- Routes the local service to the installed model/runtime and identifies Sonderr-v1 in its system instructions.
- Reworks the launch trailer as continuously animated Sonderr scenes and kinetic titles, rendered as unique 1920×1080 frames at 60 fps.

## v1.5.14 — Flowing Sonderr-v1 launch film

- Replaces the static-feeling launch cut with a continuously animated 88-second trailer, rendered and encoded at 60 fps with synchronized score.
- Embeds the 1080p H.264 trailer in the launch poster and announcements archive.
- Moves the local Sonderr-v1 inference service off the app's port and validates its JSON health identity before using it, preventing an app page from being mistaken for a successful model response.

## v1.5.11 — Sonderr-v1 · The start of the SLM generation

- Pins Sonderr-v1 at the top of the model picker with a **NEW** badge. Selecting it switches the active provider to the local Sonderr model.
- Adds the generated Sonderr-v1 key art, mascot reveal, announcement archive entry, interactive launch presentation, and 1080p launch demo video.
- Adds the merged Sonderr-v1 Transformers model archive as a separate GitHub Release asset. The archive includes tokenizer/config files, upstream Qwen Apache-2.0 license notice, and training provenance; inference requires a compatible local Transformers runtime.
- Presents Sonderr-v1 as Sonderr’s first SLM, specialized for the Sonderr environment. Sonderr’s model line is intended to stay SLM-scale.

## 1.5.13 — Reliable updates

- Match the package version to the release tag, refresh metadata before install, correctly validate downloaded tag versions, and avoid duplicate servers during managed updates.
- Show the local updater log location when an update fails.
- Play the full 88-second Sonderr-v1 trailer in the launch popup and announcements archive.

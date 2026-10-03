# Changelog

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

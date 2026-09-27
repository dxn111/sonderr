# Changelog

## Unreleased

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

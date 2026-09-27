# Changelog

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

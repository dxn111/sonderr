# Changelog

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

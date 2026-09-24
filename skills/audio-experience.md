---
id: audio-experience
name: Audio experience
category: Product
icon: ◒
triggers: audio, sound, music, voice, playback, tts, speech, microphone, recording, volume, podcast, player, listening
summary: Build polished sound features — permissions, playback states, controls, interruptions, and graceful fallbacks.
---
## When to use
- Adding or improving playback, recording, text-to-speech, or any sound in the product.

## Approach
Audio is invisible until it breaks, so design the states you cannot see: permission denied, device missing, interrupted by a call, autoplay blocked. The visual surface must communicate all of them.

## Steps
1. Check permission and capability paths first: denied, granted-late, no device, insecure context. Each needs a visible, actionable state.
2. Define the playback state machine: idle, loading, playing, paused, ended, error — and render it, do not infer it.
3. Give full control affordances: play/pause, seek, volume, and keyboard access; remember mute preference.
4. Handle interruptions: tab hidden, incoming call, another track — pause instead of overlapping sound.
5. Respect the platform: no autoplay with sound until first user interaction; honor reduced-motion for visualizers.
6. Provide a silent fallback: the feature must still make sense with sound off (transcript, captions, visual state).

## Pitfalls
- Autoplay attempts that throw and take the whole feature down with them.
- A progress bar that lies because duration metadata loaded late.
- Microphone features that never handle "permission denied" and just stop.

## Verify
- The state machine was exercised: play, pause, seek, ended, error, permission denied — each renders correctly.
- Feature works with sound muted from the start.

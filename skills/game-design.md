---
id: game-design
name: Game design
category: Creative engineering
icon: ◈
triggers: game, gameplay, game loop, level, player, enemy, platformer, arcade, roblox, pygame, godot, unity
summary: Shape a playable loop with clear goals, feedback, difficulty, and a small testable scope.
---
## When to use
- Turning an existing script or project into a game.
- Adding gameplay, levels, enemies, scoring, controls, or progression.
- Designing a game before implementation so the result is playable rather than a pile of mechanics.

## Approach
Start with one sentence describing what the player does repeatedly and why it is fun. Keep the first slice small: one loop, one control scheme, one success state, one failure state, and one way to restart.

## Steps
1. Inspect the existing file and runtime before choosing a framework or replacing working code.
2. Write a compact design: player goal, core loop, controls, entities, win/loss states, feedback, and the smallest playable level.
3. Choose the least invasive implementation that runs in the current project and avoid adding dependencies unless they are necessary.
4. Implement a playable vertical slice with readable state, deterministic reset, and clear feedback for input, progress, success, and failure.
5. Test the loop manually and with focused checks: start, input, collision/rules, restart, and edge cases.

## Safety and scope
- Do not add network calls, telemetry, or hidden downloads just to make a game work.
- Prefer placeholder assets that are original or clearly licensed; never silently copy proprietary game assets.
- Explain any new dependency and keep generated output in the requested workspace path.

## Verify
- The named file is actually changed at its original path unless the user asked for a new file.
- The game starts, accepts its main input, reaches both success and failure states, and can restart.
- Report the exact file path, run command, and checks performed.

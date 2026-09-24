---
id: game-development
name: Game development
category: Engineering
icon: ◉
triggers: game code, game development, pygame, arcade, roblox studio, game prototype, playable, sprite, collision
summary: Implement and verify a small playable game while preserving the user's existing code and runtime.
---
## When to use
- Implementing a game from an existing script.
- Building a playable prototype with input, rendering, state, and collision or rules.
- Debugging a game that starts but does not respond, reset, or finish correctly.

## Workflow
1. Locate and read the named entry point, then inspect nearby files and the project run command.
2. Create a todo list with design, implementation, verification, and output-path items when the change spans multiple steps.
3. Load `game-design` when the user has not supplied a concrete loop, then pick a narrow first slice.
4. Edit the existing file in place when the user named it; preserve compatible public entry points and avoid deleting unrelated work.
5. Verify syntax, start-up, input handling, state transitions, reset behavior, and a short manual play path.
6. Save the result to the workspace and clearly report the exact changed path and how to run it. The UI will provide a download card for saved files.

## Pitfalls
- Adding a framework before checking whether the current runtime already supports the requested game.
- Building menus and assets before the core loop is playable.
- Claiming a game works without actually starting it or checking its main input path.

## Verify
- Start the game using the project's real entry point and try the core controls, restart, and one win/loss or completion path.
- Check console output and confirm assets resolve from the expected working directory.
- Tell the user what was tested manually versus what remains untested.

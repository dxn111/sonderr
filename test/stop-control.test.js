// Stop control + unified mode + latency work (v1.7.3): the composer Stop
// button must stop any running turn gracefully (server wraps up honestly,
// swarm workers get skipped, history shows a Stopped chip), Ask/Plan/Build/
// Vision collapse into one automatic mode, and read-only tool rounds run in
// parallel. These checks pin the engine behavior and the web wiring so a
// refactor cannot silently drop a piece.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const provider = require("../server/provider");
const agents = require("../server/agents");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const app = () => read("server/app.js");
const ui = () => read("web/ui.js");
const indexHtml = () => read("web/index.html");
const uiCss = () => read("web/ui.css");

// 1. Behavioral: malformed tool arguments get one cheap structural repair
// instead of burning a provider round on a failure.
{
  assert.deepEqual(provider.repairToolArguments('{"path": "a.txt",}'), { path: "a.txt" });
  assert.deepEqual(provider.repairToolArguments('{"path": "a.txt"'), { path: "a.txt" });
  assert.deepEqual(provider.repairToolArguments('{"query": "line\nbreak"}'), { query: "line\nbreak" });
  assert.deepEqual(provider.repairToolArguments('{"a": {"b": 1}'), { a: { b: 1 } });
  assert.equal(provider.repairToolArguments("not json at all"), null);
  assert.deepEqual(provider.repairToolArguments('{"a": 1} garbage trailing'), { a: 1 });
}

// 2. Behavioral: the swarm engine accepts the honest "skipped" state.
{
  const room = agents.createRoom({
    tasks: [{ name: "Map it", prompt: "Map the thing." }, { name: "Check it", prompt: "Check the thing." }],
    poll: { question: "Which direction should the team prioritize first?", options: [{ id: "alpha", label: "Ship the fast path" }, { id: "beta", label: "Harden the core first" }] }
  });
  const worker = room.workers[0];
  room.setStatus(worker.id, "skipped");
  const snap = room.snapshot();
  const skipped = snap.agents.find(agent => agent.id === worker.id);
  assert.equal(skipped.status, "skipped");
  assert.match(skipped.activity, /Stopped by user/);
  assert.ok(skipped.completedAt, "skipped stamps completedAt for honest timing");
  // invalid states are still refused
  room.setStatus(worker.id, "flying");
  assert.equal(snap.agents.find(agent => agent.id === worker.id).status, "skipped");
}

// 3. Server: a universal stop endpoint exists without the checkpoint gate.
{
  const source = app();
  assert.match(source, /\/api\\\/sessions\\\/\(\[\^\/\]\+\)\\\/stop\$/);
  const stopBlock = source.slice(source.indexOf("/stop$"), source.indexOf("/stop$") + 500);
  assert.match(stopBlock, /pauseRequestedSessions\.add\(id\)/);
  assert.match(stopBlock, /activeChatSessions\.has\(id\)/);
  assert.ok(!/taskCheckpoint/.test(stopBlock), "stop must not require a resumable checkpoint");
}

// 4. Server: stopping a turn ends with an honest wrap-up, not silence.
{
  const source = () => read("server/provider.js");
  assert.match(source(), /if \(userPaused && !providerInterrupted && completedToolCalls > 0\)/);
  assert.match(source(), /emit\("stopped", \{ steps: completedToolCalls \}\)/);
  assert.match(source(), /# User stop wrap-up/);
  assert.match(source(), /firstTokenMs: firstTokenAt/);
}

// 5. Server: read-only rounds run in parallel; side-effect rounds stay sequential.
{
  const source = read("server/provider.js");
  assert.match(source, /READ_ONLY_PARALLEL_TOOLS = new Set\(\[/);
  assert.match(source, /const parallelRound = assistant\.tool_calls\.length >= 2/);
  assert.match(source, /Promise\.all\(assistant\.tool_calls\.map/);
  // mutating tools must never be in the parallel set
  const setBlock = source.slice(source.indexOf("READ_ONLY_PARALLEL_TOOLS"), source.indexOf("]);", source.indexOf("READ_ONLY_PARALLEL_TOOLS")));
  for (const mutating of ["write_workspace_file", "run_terminal_command", "prepare_wallet_transaction", "send_email", "call_mcp_tool", "patch_workspace_file"]) {
    assert.ok(!setBlock.includes(mutating), mutating + " must not run in parallel");
  }
  assert.ok(setBlock.includes("read_workspace_file") && setBlock.includes("search_workspace"));
}

// 6. Server: the swarm honors stop before worker passes and phases.
{
  const source = app();
  assert.match(source, /const userStoppedRun = \(\) => pauseRequestedSessions\.has\(activeSessionId\)/);
  assert.match(source, /room\.setStatus\(worker\.id, "skipped"\)/);
  assert.match(source, /if \(successful\.length && !userStoppedRun\(\)\)/);
  assert.match(source, /Run stopped by the user/);
}

// 7. Server: unified mode — "auto" resolves to vision with images, build without.
{
  const source = app();
  assert.match(source, /\["auto", "ask", "plan", "build", "vision"\]\.includes\(parsed\.mode\)/);
  assert.match(source, /requestedMode === "auto" \? \(imagePaths\.length \? "vision" : "build"\) : requestedMode/);
  assert.match(source, /unified mode/);
  // mutation gates no longer tell users to switch modes manually
  for (const stale of ["Switch the task mode to Build", "Switch to Vision before", "Switch to Build, then enable"]) {
    assert.ok(!source.includes(stale), "stale mode-switch instruction found: " + stale);
  }
}

// 8. Client: the composer stop button, Esc shortcut, and honest stop UI.
{
  const source = ui();
  assert.match(source, /async function requestStop\(\)/);
  assert.match(source, /\/api\/sessions\/" \+ encodeURIComponent\(handle\.sessionId\) \+ "\/stop/);
  assert.match(source, /sendBtn\.classList\.toggle\("stop-mode", busy\)/);
  assert.match(source, /if \(state\.sending\) requestStop\(\); else send\(\)/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /stopped\(\) \{/);
  assert.match(source, /stopped-chip/);
  assert.match(source, /tool-state stop/);
  assert.match(source, /activeStopHandle\?\.requested && \(e\?\.name === "AbortError"/);
  assert.match(source, /signal: stopController\.signal/);
  assert.match(source, /evt\.firstTokenMs/);
  const css = uiCss();
  assert.match(css, /\.send-btn\.stop-mode/);
  assert.match(css, /\.stopped-chip/);
  assert.match(css, /\.tool-state\.stop/);
}

// 9. Client: unified mode UI — one Auto chip, images auto-route to vision.
{
  const source = ui();
  assert.match(source, /sentImages\.length && requestMode === "build"\) requestMode = "vision"/);
  assert.match(source, /\(state\.mode === "vision" \|\| state\.images\.length\)/);
  const html = indexHtml();
  assert.match(html, /data-mode="auto"/);
  assert.ok(!/data-mode="ask"/.test(html), "manual Ask mode button removed");
  assert.ok(!/data-mode="vision"/.test(html), "manual Vision mode button removed");
}

// 10. Docs reference: dxn1-docs.vercel.app wired into the app.
{
  const html = indexHtml();
  assert.match(html, /class="topbar-docs" href="https:\/\/dxn1-docs\.vercel\.app"/);
  assert.match(html, /class="welcome-docs-link" href="https:\/\/dxn1-docs\.vercel\.app"/);
  assert.match(app(), /\/docs\/online/);
  assert.match(app(), /Location: "https:\/\/dxn1-docs\.vercel\.app"/);
  assert.match(read("web/docs.html"), /dxn1-docs\.vercel\.app/);
  assert.match(read("web/update.html"), /href="https:\/\/dxn1-docs\.vercel\.app"/);
  const css = uiCss();
  assert.match(css, /\.topbar-docs/);
  assert.match(css, /\.welcome-docs-link/);
}

console.log("stop control, unified mode, and latency tests passed");

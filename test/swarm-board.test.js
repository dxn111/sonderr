// Swarm board (v1.7.2): the team room must carry live phases and honest
// timing so the inline mission board and the room modal can show a real
// phase tracker (research → cross-review → synthesis → complete) with
// per-worker elapsed chips. These checks pin the engine behavior and the
// web wiring so a refactor cannot silently drop a piece.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const agents = require("../server/agents");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

const POLL = { question: "Which direction should the team prioritize?", options: [{ id: "alpha", label: "Ship the fast path" }, { id: "beta", label: "Harden the core first" }] };

// 1. Engine: rooms are born in the research phase with honest timestamps.
{
  const room = agents.createRoom({
    tasks: [{ name: "Map the API", prompt: "Map the public API surface.", role: "Researcher" }, { name: "Check deps", prompt: "Check dependency health.", role: "Analyst" }],
    poll: POLL
  });
  assert.equal(room.room.phase, "research");
  assert.ok(Number.isFinite(Date.parse(room.room.startedAt)), "room needs a startedAt timestamp");
  assert.equal(room.room.completedAt, null);
  assert.ok(room.room.agents.filter(a => a.role !== "Lead").every(agent => agent.startedAt === null && agent.completedAt === null), "workers start unstarted");

  // Worker timing: researching starts the clock, completing stops it.
  room.setStatus("worker-1", "researching");
  assert.ok(Number.isFinite(Date.parse(room.room.agents.find(a => a.id === "worker-1").startedAt)), "researching must stamp startedAt");

  // Phase transitions announce themselves on the lead timeline.
  room.setPhase("review", "First pass is in — cross-review now.");
  assert.equal(room.room.phase, "review");
  const announced = room.room.entries.filter(entry => entry.type === "activity" && entry.senderId === "lead");
  assert.ok(announced.some(entry => entry.text.includes("cross-review")), "phase announcements must land as lead activity entries");
  room.setPhase("bogus"); // invalid phases are ignored
  assert.equal(room.room.phase, "review");

  room.setPhase("synthesis");
  assert.equal(room.room.phase, "synthesis");

  // Voting + finish: the run closes with a completedAt stamp and poll result.
  assert.ok(room.vote("worker-1", "alpha", "Fastest verified route"));
  const finished = room.finish("complete");
  assert.equal(finished.status, "complete");
  assert.equal(finished.phase, "complete");
  assert.ok(Number.isFinite(Date.parse(finished.completedAt)), "finish must stamp completedAt");
  assert.equal(finished.poll.status, "closed");
}

// 2. Engine: failed runs still close the phase/timing bookkeeping.
{
  const room = agents.createRoom({ tasks: [{ name: "Solo pass", prompt: "Do the read-only pass." }], poll: POLL });
  room.setStatus("worker-1", "researching");
  room.setStatus("worker-1", "failed");
  const agent = room.room.agents.find(item => item.id === "worker-1");
  assert.ok(Number.isFinite(Date.parse(agent.completedAt)), "failed workers must stamp completedAt");
  const finished = room.finish("failed");
  assert.equal(finished.status, "failed");
  assert.equal(finished.phase, "complete");
  assert.ok(finished.completedAt);
}

// 3. Engine: restored rooms are complete runs with backfilled timing.
{
  const fresh = agents.createRoom({ tasks: [{ name: "Map", prompt: "Map the surface." }, { name: "Verify", prompt: "Verify claims." }], poll: POLL });
  fresh.publish("lead", "synthesis", "Evidence lands on alpha.");
  const saved = fresh.snapshot();
  const entries = [{ id: "e1", at: saved.startedAt, senderId: "lead", type: "activity", text: "kickoff" }];
  const restored = agents.restoreRoom({ ...saved, completedAt: null }, entries, "session-x");
  assert.ok(restored, "restoreRoom must revive a valid snapshot");
  assert.equal(restored.room.phase, "complete");
  assert.ok(restored.room.completedAt, "restoreRoom must backfill completedAt");
}

// 4. Web: the inline mission board, the modal phase strip, and the timing.
const ui = read("web/ui.js");
assert.ok(ui.includes("function swarmPhaseOf("), "the board needs the phase resolver");
assert.ok(ui.includes("function swarmElapsedLabel(") && ui.includes("function swarmElapsedChip("), "the board needs honest elapsed chips");
assert.ok(ui.includes("function ensureSwarmTicker("), "live chips must tick once per second");
assert.ok(ui.includes("SWARM_PHASE_LABELS"), "statuses must read as phases, not raw ids");
assert.ok(ui.includes("swarmPhaseStrip(room, entries)"), "the inline card and the modal must share the phase strip");
assert.ok(ui.includes('swarm-verdict-kicker">LEAD SYNTHESIS'), "the lead verdict must preview on the board");
assert.ok(ui.includes("swarm-signals"), "the board must show finding/help/risk/vote counters");
assert.ok(ui.includes('aria-label="Live team board"'), "the worker list must be labeled as a live board");
assert.ok(ui.includes("Commander is synthesizing"), "the synthesis phase must be spoken in plain words");
assert.ok(ui.includes('seg.className = "md md-seg streaming" + (this._step ? "" : " seg-plan")'), "the plan kicker must label pre-tool narration");
assert.ok(ui.includes("let sawTool = false"), "history segments must use the same plan rule");
assert.ok(ui.includes('spawn_subagents: "Spawn AI team"'), "the team spawn must render as a titled step card");
assert.ok(ui.includes('toolSummary(name, input = {}) {\n  let s = "";\n  if (name === "spawn_subagents"'), "the team spawn card must summarize its workers");
assert.ok(ui.includes("this._spawnBlock = block"), "the running spawn card must mirror live team progress");
assert.ok(ui.includes('"Recovering from " + toolTitle(ev.name).toLowerCase()'), "failed steps must narrate honest recovery");
assert.ok(ui.includes('agent-room-task-avatar'), "worker rows must carry avatars");
assert.ok(ui.includes("agent-roster-meta"), "modal roster must show elapsed/tokens/findings");

// 5. Styles + modal container.
const css = read("web/ui.css");
assert.ok(css.includes(".swarm-phases{"), "phase strip styles must exist");
assert.ok(css.includes("@keyframes swarm-phase-pulse"), "the active phase must pulse");
assert.ok(css.includes(".swarm-verdict{"), "the verdict preview must be styled");
assert.ok(css.includes(".md-seg.seg-plan::before"), "the plan kicker must render via CSS");
assert.ok(css.includes(".agent-room-phases{"), "the modal phase strip must be styled");
assert.ok(css.includes(".swarm-elapsed{"), "elapsed chips must be styled");
const html = read("web/index.html");
assert.ok(html.includes('id="agentRoomPhases"'), "the room modal needs a phase strip container");

// 6. Server wiring: the swarm loop drives the phases, and the prompt tells
//    the lead to treat the board as the presentation layer.
const app = read("server/app.js");
assert.ok(app.includes('room.setPhase("review"'), "the loop must advance to cross-review");
assert.ok(app.includes('room.setPhase("synthesis"'), "the loop must advance to synthesis");
assert.ok(app.includes("live board inline"), "the workflow prompt must describe the live board");

console.log("swarm board tests passed");

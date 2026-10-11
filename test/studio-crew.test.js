"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const crew = require("../server/studio-crew");

// The Studio Crew is always a duo.
assert.equal(crew.DUO_SIZE, 2);
assert.deepEqual(crew.TRACKS.sort(), ["app", "bounty", "design", "developer", "pdf", "project", "site"]);

for (const track of crew.TRACKS) {
  const members = crew.crewForTrack(track);
  assert.equal(members.length, 2, `${track} crew must have exactly two specialists`);
  for (const member of members) {
    assert.ok(member.role && member.role.length >= 4, `${track} specialist needs a role`);
    assert.ok(member.focus && member.focus.length >= 8, `${track} specialist needs a focus`);
    assert.ok(member.assignment && member.assignment.length >= 40, `${track} specialist needs a specific assignment brief`);
    assert.ok(member.review && member.review.length >= 30, `${track} specialist needs a review lens`);
  }
  const roles = new Set(members.map(member => member.role));
  assert.equal(roles.size, 2, `${track} specialists must be distinct`);
}

// Specialized creative tracks exist and pair complementary specialists.
assert.deepEqual(crew.crewForTrack("pdf").map(member => member.role), ["Document Architect", "Page Designer"]);
assert.deepEqual(crew.crewForTrack("design").map(member => member.role), ["Design Lead", "Craft Specialist"]);
assert.deepEqual(crew.crewForTrack("site").map(member => member.role), ["Site Architect", "Interface Designer"]);
assert.deepEqual(crew.crewForTrack("app").map(member => member.role), ["App Engineer", "Experience Designer"]);
assert.equal(crew.crewForTrack("unknown-track").length, 2);

// The crew brief mandates exactly two workers with one specific task each.
const brief = crew.crewBrief("pdf", { title: "Q3 report", goal: "A crisp quarterly report", milestone: "Draft the full content and structure" });
assert.match(brief, /EXACTLY two tasks/);
assert.match(brief, /Never one worker, never three or more/);
assert.match(brief, /Document Architect/);
assert.match(brief, /Page Designer/);
assert.match(brief, /Draft the full content and structure/);
assert.match(brief, /spawn_subagents/);
assert.match(brief, /Workers are read-only/);
assert.match(brief, /you then perform every edit/);

// Unknown tracks fall back to the general project crew.
const fallbackBrief = crew.crewBrief("mystery", {});
assert.match(fallbackBrief, /Project Planner/);
assert.match(fallbackBrief, /Build Specialist/);

// Client mirror stays in sync: same tracks, same roles, same order.
const ui = fs.readFileSync("web/ui.js", "utf8");
const clientBlock = ui.slice(ui.indexOf("const STUDIO_CREWS"), ui.indexOf("function studioCrewFor"));
for (const track of crew.TRACKS) {
  assert.ok(clientBlock.includes(`  ${track}: [`), `ui.js STUDIO_CREWS must include ${track}`);
  for (const member of crew.crewForTrack(track)) {
    assert.ok(clientBlock.includes(`role: "${member.role}"`), `ui.js ${track} crew must include ${member.role}`);
  }
}

// New tracks are accepted by the store and render a canvas.
const store = fs.readFileSync("server/store.js", "utf8");
assert.match(store, /"project", "site", "app", "pdf", "design", "developer", "bounty"/);
const studioProject = ui.match(/const isCanvasTrack = \[([^\]]+)\]/);
assert.ok(studioProject, "ui.js must define the canvas track list");
assert.deepEqual(studioProject[1].split(",").map(item => item.trim().replaceAll('"', "")), ["site", "app", "pdf", "design"]);

// The studios home advertises the specialized paths and the crew banner.
const index = fs.readFileSync("web/index.html", "utf8");
assert.match(index, /data-studio-track="pdf"/);
assert.match(index, /data-studio-track="design"/);
assert.match(index, /id="studiosCrewBanner"/);
assert.match(index, /sonderr-studios-hero\.png/);
assert.match(index, /sonderr-studios-crew\.png/);
assert.ok(fs.existsSync("web/assets/sonderr-studios-hero.png"));
assert.ok(fs.existsSync("web/assets/sonderr-studios-crew.png"));
assert.ok(fs.existsSync("web/assets/sonderr-studios-craft.png"));

// The server prompt wiring fields the crew on Studios sessions.
const app = fs.readFileSync("server/app.js", "utf8");
assert.match(app, /studioCrew\.crewBrief\(session\.studio\?\.track/);
assert.match(app, /studios && !smallDirectAsk && mode !== "vision"/);
assert.match(app, /\(studios && mode === "build" && !smallDirectAsk\)/);

console.log("studio-crew tests passed");

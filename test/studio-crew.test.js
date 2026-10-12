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
assert.match(brief, /BUILD PHASE/);

// The crew is phase-aware: each phase fields different specific tasks.
for (const phase of ["plan", "build", "review", "advise"]) {
  assert.ok(crew.PHASES[phase].label && crew.PHASES[phase].intent, `${phase} needs a label and intent`);
  const phaseBrief = crew.crewBrief("site", { title: "Portfolio", milestone: "Build responsive pages", phase });
  assert.match(phaseBrief, new RegExp(crew.PHASES[phase].label));
  for (const member of crew.crewForTrack("site")) {
    assert.match(phaseBrief, new RegExp(member.phases[phase].slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${phase} brief must carry the ${member.role} task`);
  }
}
assert.equal(crew.phaseFor("build", "anything"), "build");
assert.equal(crew.phaseFor("plan", "anything"), "plan");
assert.equal(crew.phaseFor("ask", "please review the diff for regressions"), "review");
assert.equal(crew.phaseFor("ask", "how do I add a page?"), "advise");
for (const track of crew.TRACKS) {
  for (const member of crew.crewForTrack(track)) {
    for (const phase of ["plan", "build", "review", "advise"]) {
      assert.ok(member.phases[phase].length >= 40, `${track} ${member.role} needs a specific ${phase} task`);
    }
  }
}

// Every craft carries a professional playbook with a definition of done.
for (const track of crew.TRACKS) {
  const playbook = crew.PLAYBOOKS[track];
  assert.equal(playbook.rules.length, 5, `${track} playbook needs five rules`);
  assert.ok(playbook.rules.every(rule => rule.length >= 30), `${track} playbook rules must be substantive`);
  assert.ok(playbook.done.length >= 40, `${track} needs a definition of done`);
  const craft = crew.craftBrief(track);
  assert.match(craft, /Craft standard/);
  assert.match(craft, /Definition of done/);
  assert.match(craft, new RegExp(playbook.done.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

// Unknown tracks fall back to the general project crew.
const fallbackBrief = crew.crewBrief("mystery", {});
assert.match(fallbackBrief, /Project Planner/);
assert.match(fallbackBrief, /Build Specialist/);

// Client mirror stays in sync: same tracks, same roles, same order, plus the
// per-phase NOW tasks and the craft chips.
const ui = fs.readFileSync("web/ui.js", "utf8");
const clientBlock = ui.slice(ui.indexOf("const STUDIO_CREWS"), ui.indexOf("function studioCrewFor"));
for (const track of crew.TRACKS) {
  assert.ok(clientBlock.includes(`  ${track}: [`), `ui.js STUDIO_CREWS must include ${track}`);
  for (const member of crew.crewForTrack(track)) {
    assert.ok(clientBlock.includes(`role: "${member.role}"`), `ui.js ${track} crew must include ${member.role}`);
    for (const phase of ["plan", "build", "review"]) {
      assert.ok(new RegExp(`role: "${member.role}"[^}]*now: \\{[^}]*${phase}: `).test(clientBlock), `ui.js ${member.role} needs a ${phase} NOW task`);
    }
  }
}
const craftBlock = ui.slice(ui.indexOf("const STUDIO_PLAYBOOKS"), ui.indexOf("const STUDIO_PHASE_LABELS"));
for (const track of crew.TRACKS) {
  assert.ok(craftBlock.includes(`  ${track}: { chips: [`), `ui.js STUDIO_PLAYBOOKS must include ${track}`);
  assert.ok(craftBlock.includes(crew.PLAYBOOKS[track].done.slice(0, 30)), `ui.js ${track} must mirror the definition of done`);
}
assert.match(ui, /function studioPhaseOf/);

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
assert.match(index, /sonderr-v16-otter-phases\.png/);
assert.match(index, /sonderr-studios-deliverables\.png/);
assert.match(index, /studios-showcase/);
assert.ok(fs.existsSync("web/assets/sonderr-studios-hero.png"));
assert.ok(fs.existsSync("web/assets/sonderr-studios-crew.png"));
assert.ok(fs.existsSync("web/assets/sonderr-studios-craft.png"));
assert.ok(fs.existsSync("web/assets/sonderr-v16-otter-phases.png"));
assert.ok(fs.existsSync("web/assets/sonderr-studios-deliverables.png"));

// The server prompt wiring fields the crew on Studios sessions, phase-aware,
// and holds every deliverable to the craft standard.
const app = fs.readFileSync("server/app.js", "utf8");
assert.match(app, /studioCrew\.crewBrief\(session\.studio\?\.track/);
assert.match(app, /studioCrew\.phaseFor\(mode, content\)/);
assert.match(app, /studioCrew\.craftBrief\(session\.studio\?\.track\)/);
assert.match(app, /studios && !smallDirectAsk && mode !== "vision"/);
assert.match(app, /\(studios && mode === "build" && !smallDirectAsk\)/);

// The release center advertises the phase-aware crew and the new art.
// Since v1.6.2 the hero is the otter-pet key art; the finale art remains
// in the repo for the v1.6 archive story.
const update = fs.readFileSync("web/update.html", "utf8");
assert.match(update, /sonderr-v162-pet\.png/);
assert.match(update, /Two specialists, phase-aware/);
assert.ok(fs.existsSync("web/assets/sonderr-v162-pet.png"));
assert.ok(fs.existsSync("web/assets/sonderr-v16-finale.png"));

console.log("studio-crew tests passed");

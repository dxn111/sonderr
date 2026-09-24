"use strict";

const assert = require("node:assert/strict");
const quality = require("../server/quality");

assert.equal(quality.LEVELS.S1.minimumMs, 10_000);
assert.equal(quality.LEVELS.S4.minimumMs, 60_000);
assert.equal(quality.LEVELS.H1.minimumMs, 5 * 60_000);
assert.equal(quality.LEVELS.H4.minimumMs, 20 * 60_000);
assert.equal(quality.LEVELS.U1.minimumMs, 6 * 60 * 60_000);
assert.equal(quality.LEVELS.U10.minimumMs, 30 * 60 * 60_000);
assert.equal(quality.LEVELS.S1.runLimit, 2);
assert.equal(quality.LEVELS.H4.runLimit, 20);
assert.equal(quality.LEVELS.U10.runLimit, 260);
assert.equal(Object.keys(quality.LEVELS).length, 18);
assert.throws(() => quality.normalizeTier("S5"), /S1-S4/);
let refreshed = quality.begin(null, "task-quality-refresh", "S4", 1_000);
refreshed = quality.refresh(refreshed, 11_000);
assert.equal(refreshed.activeMs, 10_000, "milestone refresh persists elapsed active time");
assert.equal(quality.snapshot(refreshed, 12_000).elapsedMs, 11_000, "refresh must not double count the previous interval");
quality.pause(refreshed, 12_000);

let state = quality.begin(null, "task-active-pause", "H1", 1_000);
assert.equal(quality.snapshot(state, 61_000).elapsedMs, 60_000);
assert.equal(quality.snapshot(state, 61_000).ready, false);

state = quality.pause(state, 61_000);
assert.equal(state.activeMs, 60_000);
assert.equal(quality.snapshot(state, 86_461_000).elapsedMs, 60_000, "time between turns must not count");

state = quality.resume(state, "task-active-pause", 86_461_000);
assert.equal(quality.snapshot(state, 86_581_000).elapsedMs, 180_000);
state = quality.pause(state, 86_581_000);
assert.equal(state.activeMs, 180_000);
assert.equal(quality.snapshot(state, 900_000_000).elapsedMs, 180_000, "paused time must remain excluded");

state = quality.begin(state, "task-active-pause", "U1", 900_000_000);
assert.equal(state.tier, "U1", "tier upgrades should preserve accumulated active time");
assert.equal(state.activeMs, 180_000);
const newTask = quality.begin(state, "new-task", "H1", 900_000_000);
assert.equal(newTask.elapsedMs, 0, "a different task starts with a fresh budget");
quality.pause(newTask, 900_000_000);

const legacy = quality.resume({ taskKey: "legacy-task", tier: "H1", startedAt: 1, minimumMs: quality.LEVELS.H1.minimumMs }, "legacy-task", 10_000);
assert.equal(legacy.elapsedMs, 0, "legacy wall-clock durations must not be treated as active work");
quality.pause(legacy, 10_000);

let hourly = quality.begin(null, "hourly-quality-gate", "U1", 100);
assert.equal(quality.activeHourCount(hourly, 3_600_099), 0, "hour boundaries use active work, not wall-clock start rounding");
assert.equal(quality.activeHourCount(hourly, 3_600_100), 1, "the first review gate is reached after one active hour");
hourly = quality.pause(hourly, 3_600_100);
assert.equal(quality.activeHourCount(hourly, 30 * 24 * 60 * 60 * 1000), 1, "paused days do not trigger additional hourly gates");

console.log("quality budget tests passed");

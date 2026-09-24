"use strict";

const assert = require("node:assert/strict");
const { recordProgress } = require("../server/progress");

const seen = new Set();
const read = output => ({ type: "tool_end", name: "read_workspace_file", input: { path: "src/app.js" }, output });

assert.equal(recordProgress([read({ content: "original" })], seen), true, "new workspace evidence counts once");
assert.equal(recordProgress([read({ content: "original", durationMs: 80 })], seen), false, "re-reading identical evidence does not count because of timing noise");
assert.equal(recordProgress([read({ content: "updated" })], seen), true, "changed evidence is useful progress");

const sameWrite = { type: "tool_end", name: "write_workspace_file", input: { path: "src/app.js" }, output: { changed: false } };
const changedWrite = { ...sameWrite, output: { changed: true } };
assert.equal(recordProgress([sameWrite], seen), false, "idempotent writes do not count");
assert.equal(recordProgress([changedWrite], seen), true, "actual file changes count");

const check = { type: "tool_end", name: "run_project_checks", input: {}, output: { results: [{ command: "npm test", ok: true }] } };
assert.equal(recordProgress([check], seen), true, "new verification evidence counts");
assert.equal(recordProgress([{ ...check, durationMs: 30 }], seen), false, "repeating the same check result is not new evidence");
assert.equal(recordProgress([{ ...check, output: { results: [{ command: "npm test", ok: false }] } }], seen), true, "a changed verification result is new evidence");

assert.equal(recordProgress([{ ...read({ error: "denied" }) }], seen), false, "failed reads never count");
assert.equal(recordProgress([{ type: "tool_end", name: "task_checkpoint_write", output: { ok: true } }], seen), false, "checkpoint bookkeeping is not progress");

console.log("autonomous progress evidence tests passed");

"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const temporaryHome = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-task-memory-home-"));
process.env.HOME = temporaryHome;
const { createTaskMemory, MAX_NOTE_BYTES } = require("../server/task-memory");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-task-memory-test-"));
let now = Date.now();
const memory = createTaskMemory({ root, now: () => now });
const session = "d15c7d89-61aa-46ca-a246-2fa0cf4ef102";
const task = "message-id-for-long-running-task";

const created = memory.write(session, task, "decisions", "Keep the API backward compatible.\napi_key=sk-123456789012345678901234");
assert.equal(created.updated, false);
assert.ok(created.bytes > 0);
const taskDir = path.join(root, session, crypto.createHash("sha256").update(task).digest("hex").slice(0, 32));
assert.equal(fs.statSync(path.join(root, session)).mode & 0o777, 0o700);
assert.equal(fs.statSync(taskDir).mode & 0o777, 0o700);
assert.equal(fs.statSync(path.join(taskDir, "decisions.md")).mode & 0o777, 0o600);

const notes = memory.list(session, task);
assert.equal(notes.notes.length, 1);
assert.equal(notes.notes[0].name, "decisions.md");
const loaded = memory.read(session, task, "decisions");
assert.match(loaded.content, /backward compatible/);
assert.match(loaded.content, /\[redacted by Sonderr safety\]/);
assert.doesNotMatch(loaded.content, /sk-123456789012345678901234/);
assert.throws(() => memory.write(session, task, "../escape", "no"), /short note name/);
assert.throws(() => memory.write(session, task, "too-big", "x".repeat(MAX_NOTE_BYTES + 1)), /12000 bytes/);
assert.throws(() => memory.read(session, task, "missing"), /ENOENT/);
const secondTask = "second-task-key";
memory.write(session, secondTask, "temporary", "This note should be cleared at completion.");
assert.deepEqual(memory.clear(session, secondTask), { ok: true, removed: 1 });
assert.deepEqual(memory.list(session, secondTask).notes, []);
const hostileSession = "a11c7e89-61aa-46ca-a246-2fa0cf4ef102";
const hostileTaskKey = "hostile-task";
const hostileTaskDir = path.join(root, hostileSession, crypto.createHash("sha256").update(hostileTaskKey).digest("hex").slice(0, 32));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-task-memory-outside-"));
fs.mkdirSync(path.dirname(hostileTaskDir), { recursive: true });
fs.symlinkSync(outside, hostileTaskDir, "dir");
assert.throws(() => memory.list(hostileSession, hostileTaskKey), /Unsafe task memory path/);
assert.deepEqual(fs.readdirSync(outside), [], "symlinked task storage cannot escape the private memory root");

now += 31 * 24 * 60 * 60 * 1000;
assert.deepEqual(memory.list(session, task).notes, [], "expired notes are automatically removed");
assert.deepEqual(memory.clear(session, task), { ok: true, removed: 0 });
fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(outside, { recursive: true, force: true });
fs.rmSync(temporaryHome, { recursive: true, force: true });
console.log("task memory tests passed");

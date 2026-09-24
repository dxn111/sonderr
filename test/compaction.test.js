"use strict";

const assert = require("node:assert/strict");
const { compactConversation, sizeOf } = require("../server/compaction");

const longTranscript = [
  { role: "user", content: "Old unrelated request" },
  { role: "assistant", content: "Old answer" },
  { role: "assistant", tool_calls: [{ id: "call-old", type: "function", function: { name: "read_file", arguments: "{}" } }] },
  { role: "tool", tool_call_id: "call-old", content: "x".repeat(18_000) },
  { role: "assistant", content: "Verified the target file currently has 12 lines." },
  { role: "user", content: "Continue the long-running implementation" },
  { role: "assistant", content: "Next I will run the focused checks." }
];

const result = compactConversation({
  messages: longTranscript,
  anchorMessages: [
    { role: "user", content: "Build a resilient 30-hour task runner; keep safety checks and do not weaken approval boundaries." }
  ],
  checkpoint: { goal: "Keep long tasks high quality", currentMilestone: "Implement bounded memory", nextAction: "Run regression tests" },
  maxChars: 8_000
});

assert.equal(result.compacted, true);
assert.equal(result.messages.length, 1, "compaction replaces provider protocol history with one safe context message");
assert.equal(result.messages[0].role, "user");
assert.match(result.messages[0].content, /30-hour task runner/);
assert.match(result.messages[0].content, /latest saved checkpoint/i);
assert.match(result.messages[0].content, /untrusted/i);
assert.match(result.messages[0].content, /Continue the long-running implementation/);
assert.match(result.messages[0].content, /Verified the target file/);
assert.doesNotMatch(JSON.stringify(result.messages), /call-old|tool_call_id|tool_calls/);
assert.ok(sizeOf(result.messages) < 10_000, "compacted request context stays bounded");

console.log("context compaction tests passed");

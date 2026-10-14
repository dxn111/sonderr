"use strict";

// v1.7 workflow tests: token streaming with live delta events, bulletproof
// fallbacks (JSON-answering gateways, stream-rejecting providers), mid-loop
// provider-interruption recovery, and the turn-handoff synthesis on limits.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const temporaryHome = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-streaming-test-"));
process.env.HOME = temporaryHome;
const store = require("../server/store");
const provider = require("../server/provider");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function toolCall(id, name, args) {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

/** Build one OpenAI-style SSE chunk. */
function chunk({ content = "", toolCalls = null, finishReason = null, usage = null } = {}) {
  const delta = {};
  if (content) delta.content = content;
  if (toolCalls) delta.tool_calls = toolCalls;
  const choice = { index: 0, delta };
  if (finishReason) choice.finish_reason = finishReason;
  const payload = { id: "chatcmpl-test", object: "chat.completion.chunk", choices: [choice] };
  if (usage) payload.usage = usage;
  return "data: " + JSON.stringify(payload) + "\n\n";
}

const SSE_HEADERS = { "Content-Type": "text/event-stream", "Cache-Control": "no-store" };

(async () => {
  // --- Scenario 1: streamed completion with narration, tool calls, and a
  // final answer. Deltas must arrive live through onEvent in order, the tool
  // must execute, and the final content must be the second round's text.
  {
    const bodies = [];
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", c => { raw += c; });
      req.on("end", () => {
        const body = JSON.parse(raw);
        bodies.push(body);
        res.writeHead(200, SSE_HEADERS);
        if (!body.messages.some(m => m.role === "tool")) {
          res.write(chunk({ content: "Let me check the workspace first.\n" }));
          res.write(chunk({ toolCalls: [{ index: 0, id: "call-1", function: { name: "probe_tool", arguments: "" } }] }));
          res.write(chunk({ toolCalls: [{ index: 0, function: { arguments: "{\"path\":\"index.html\"}" } }] }));
          res.write(chunk({ finishReason: "tool_calls" }));
          res.write(chunk({ usage: { prompt_tokens: 20, completion_tokens: 12 } }));
          res.end("data: [DONE]\n\n");
        } else {
          res.write(chunk({ content: "The file " }));
          res.write(chunk({ content: "looks good." }));
          res.write(chunk({ finishReason: "stop" }));
          res.end("data: [DONE]\n\n");
        }
      });
    });
    const port = await listen(server);
    store.updateSettings({ provider: "custom", baseURL: `http://127.0.0.1:${port}/v1`, model: "stream-test", apiKey: "stream-test-key" });
    try {
      const liveEvents = [];
      const executed = [];
      const result = await provider.generate({
        messages: [{ role: "user", content: "Check the workspace" }],
        system: "test",
        tools: [{ type: "function", function: { name: "probe_tool", description: "probe", parameters: { type: "object", properties: { path: { type: "string" } } } } }],
        executeTool: async (name, input) => { executed.push({ name, input }); return { ok: true, path: input.path }; },
        onEvent: event => liveEvents.push(event)
      });
      assert.ok(result.ok);
      assert.equal(result.content, "The file looks good.");
      assert.equal(result.rounds, 1);
      assert.deepEqual(executed, [{ name: "probe_tool", input: { path: "index.html" } }]);
      const deltas = liveEvents.filter(e => e.type === "delta").map(e => e.text);
      assert.ok(deltas.length >= 2, "streamed text reaches the UI as multiple live deltas");
      assert.match(deltas.join(""), /Let me check the workspace first\./, "the pre-tool narration streams live");
      assert.ok(deltas.join("").includes("The file looks good."), "the final answer streams live too");
      const segments = liveEvents.filter(e => e.type === "segment");
      assert.equal(segments.length, 1, "the narration is also persisted as a segment event for history");
      assert.match(segments[0].text, /Let me check the workspace first\./);
      assert.equal(bodies.length, 2, "one round trip plus the follow-up");
      assert.equal(bodies[0].stream, true, "hosted providers are asked to stream");
      assert.ok(!Array.isArray(liveEvents.find(e => e.type === "delta" && e.persisted)), "deltas stay live-only");
      assert.ok(!result.events.some(e => e.type === "delta"), "delta events are not persisted into message events");
      assert.ok(result.usage.outputTokens >= 12, "streamed usage is tracked");
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }

  // --- Scenario 2: a gateway that ignores the stream flag and answers JSON.
  // It must be parsed directly with no extra request, and the rest of the turn
  // stops asking to stream.
  {
    const bodies = [];
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", c => { raw += c; });
      req.on("end", () => {
        const body = JSON.parse(raw);
        bodies.push(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Classic JSON path." }, finish_reason: "stop" }] }));
      });
    });
    const port = await listen(server);
    store.updateSettings({ provider: "custom", baseURL: `http://127.0.0.1:${port}/v1`, model: "stream-test", apiKey: "stream-test-key" });
    try {
      const result = await provider.generate({ messages: [{ role: "user", content: "hi" }], system: "test" });
      assert.ok(result.ok);
      assert.equal(result.content, "Classic JSON path.");
      assert.equal(bodies.length, 1, "a JSON-answering gateway is parsed directly, not retried");
      assert.equal(bodies[0].stream, true);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }

  // --- Scenario 3: the provider rejects the stream flag outright (HTTP 400
  // mentioning stream). The turn must fall back and succeed, never fail.
  {
    let sawUnstreamed = false;
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", c => { raw += c; });
      req.on("end", () => {
        const body = JSON.parse(raw);
        if (body.stream) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "stream is not supported by this deployment" } }));
          return;
        }
        sawUnstreamed = true;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Recovered without streaming." }, finish_reason: "stop" }] }));
      });
    });
    const port = await listen(server);
    store.updateSettings({ provider: "custom", baseURL: `http://127.0.0.1:${port}/v1`, model: "stream-test", apiKey: "stream-test-key" });
    try {
      const result = await provider.generate({ messages: [{ role: "user", content: "hi" }], system: "test" });
      assert.ok(result.ok);
      assert.equal(result.content, "Recovered without streaming.");
      assert.ok(sawUnstreamed, "the provider was retried without the stream flag");
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }

  // --- Scenario 4: a mid-loop provider interruption (every follow-up fails).
  // The turn must NOT die: it wraps up with an honest progress summary built
  // from the completed tool steps, and marks the turn incomplete for resume.
  {
    let calls = 0;
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", c => { raw += c; });
      req.on("end", () => {
        const body = JSON.parse(raw);
        calls++;
        if (!body.messages.some(m => m.role === "tool")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Reading the file.", tool_calls: [toolCall("call-int", "probe_tool", { path: "notes.txt" })] }, finish_reason: "tool_calls" }] }));
          return;
        }
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "simulated hard interruption" }));
      });
    });
    const port = await listen(server);
    store.updateSettings({ provider: "custom", baseURL: `http://127.0.0.1:${port}/v1`, model: "stream-test", apiKey: "stream-test-key" });
    try {
      const liveEvents = [];
      const result = await provider.generate({
        messages: [{ role: "user", content: "read notes" }],
        system: "test",
        tools: [{ type: "function", function: { name: "probe_tool", description: "probe", parameters: { type: "object", properties: { path: { type: "string" } } } } }],
        executeTool: async () => ({ ok: true, bytes: 12 }),
        onEvent: event => liveEvents.push(event)
      });
      assert.ok(result.ok, "an interrupted turn still resolves instead of throwing");
      assert.equal(result.incomplete, true, "the interrupted turn is marked incomplete for resume");
      assert.match(result.content, /interrupted this turn after 1 completed tool step/);
      assert.match(result.content, /Completed probe_tool · notes\.txt/, "the wrap-up lists the verified tool step");
      assert.match(result.content, /say "continue"/i);
      assert.ok(liveEvents.some(e => e.type === "status" && /Summarizing verified progress/.test(e.text)));
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }

  console.log("streaming and bulletproof workflow tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });

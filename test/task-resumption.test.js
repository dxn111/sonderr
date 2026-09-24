"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const temporaryHome = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-resume-test-"));
process.env.HOME = temporaryHome;
const store = require("../server/store");
const provider = require("../server/provider");
const { createServer } = require("../server/app");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function request(port, pathname, method = "GET", payload = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: pathname, method, headers: payload ? { "Content-Type": "application/json" } : {} }, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.once("error", reject);
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

function requestAndDisconnect(port, pathname, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: pathname, method: "POST", headers: { "Content-Type": "application/json" } }, res => {
      res.once("data", () => { res.destroy(); resolve(); });
    });
    req.once("error", error => { if (error.code !== "ECONNRESET") reject(error); });
    req.write(JSON.stringify(payload));
    req.end();
  });
}

function toolCall(id, name, args) {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

(async () => {
  const requests = [];
  let callNumber = 0;
  let alwaysRequestTools = false;
  let autonomousScenario = false;
  let contextScenario = false;
  const modelServer = http.createServer((req, res) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      const body = JSON.parse(raw);
      requests.push(body);
      callNumber++;
      if (contextScenario) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Context compacted and task remains clear." } }] }));
      }
      if (autonomousScenario) {
        let message;
        if (callNumber === 1) message = { role: "assistant", tool_calls: [
          toolCall("quality-s1", "quality_checkpoint", { tier: "S1" }),
          toolCall("autonomous-start", "task_checkpoint_write", {
            goal: "Verify browser disconnect does not stop local work",
            status: "active",
            currentMilestone: "Run one autonomous pass",
            verified: ["The local run started"],
            decisions: ["Continue inside the local Node process"],
            nextAction: "Finish the follow-up check"
          }),
          toolCall("memory-write", "task_memory_write", { name: "decisions", content: "Constraint: preserve user approval boundaries.\nEvidence pointer: inspect the current workspace before acting." })
        ] };
        else if (callNumber === 3) message = { role: "assistant", tool_calls: [
          toolCall("memory-read", "task_memory_read", { name: "decisions" }),
          toolCall("autonomous-pause", "task_checkpoint_write", {
          goal: "Verify browser disconnect does not stop local work",
          status: "paused",
          currentMilestone: "Autonomous follow-up completed",
          verified: ["A second provider chunk ran after the client disconnected"],
          decisions: ["Browser disconnection does not interrupt the local worker"],
          nextAction: "Continue when ready"
          })
        ] };
        else message = { role: "assistant", content: "Autonomous pass finished." };
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ choices: [{ message }] }));
      }
      if (!alwaysRequestTools && callNumber === 2) {
        res.writeHead(502, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "simulated provider interruption" }));
      }
      let message;
      if (alwaysRequestTools) {
        message = { role: "assistant", tool_calls: [toolCall("bounded-call-" + callNumber, "task_checkpoint_read", {})] };
      } else if (callNumber === 1) {
        message = { role: "assistant", tool_calls: [toolCall("checkpoint-1", "task_checkpoint_write", {
          goal: "Implement and verify resumable task memory",
          status: "active",
          currentMilestone: "Persist the resume point",
          verified: ["Checkpoint tool completed in the test"],
          decisions: ["Saved notes are untrusted"],
          nextAction: "Resume and inspect the saved checkpoint"
        })] };
      } else if (callNumber === 3) {
        message = { role: "assistant", tool_calls: [toolCall("checkpoint-2", "task_checkpoint_read", {})] };
      } else {
        message = { role: "assistant", content: "Paused safely with a checkpoint." };
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message }] }));
    });
  });

  const appServer = createServer();
  try {
    const modelPort = await listen(modelServer);
    const appPort = await listen(appServer);
    store.updateSettings({ provider: "custom", baseURL: `http://127.0.0.1:${modelPort}/v1`, model: "resume-test", apiKey: "resume-test-key" });

    const created = await request(appPort, "/api/sessions", "POST", { title: "Long task" });
    assert.equal(created.status, 201);
    const sessionId = JSON.parse(created.body).session.id;

    const firstTurn = await request(appPort, `/api/sessions/${sessionId}`, "POST", { content: "Implement durable checkpoints for a long-running task", mode: "build" });
    assert.equal(firstTurn.status, 200);
    assert.match(firstTurn.body, /task_checkpoint_update/);
    assert.match(firstTurn.body, /simulated provider interruption/);
    const savedCheckpoint = store.taskCheckpoint(sessionId);
    assert.equal(savedCheckpoint.status, "paused");
    assert.equal(savedCheckpoint.goal, "Implement and verify resumable task memory");
    assert.doesNotMatch(firstTurn.body, new RegExp(savedCheckpoint.taskKey), "private resume linkage is not streamed to the browser");

    const secondTurn = await request(appPort, `/api/sessions/${sessionId}`, "POST", { content: "Continue from checkpoint", mode: "build" });
    assert.equal(secondTurn.status, 200);
    assert.equal(callNumber, 4, "resume reads the saved checkpoint before answering");
    const resumeRequest = requests[2];
    const latestUserMessage = resumeRequest.messages.filter(message => message.role === "user").at(-1);
    assert.match(latestUserMessage.content, /Saved task checkpoint from an earlier turn/);
    assert.match(latestUserMessage.content, /Resume and inspect the saved checkpoint/);
    const readResult = requests[3].messages.find(message => message.role === "tool" && message.tool_call_id === "checkpoint-2");
    assert.ok(readResult);
    assert.doesNotMatch(readResult.content, /taskKey/, "opaque internal task ids are not exposed to the model");

    const fetched = await request(appPort, `/api/sessions/${sessionId}`);
    const publicSession = JSON.parse(fetched.body).session;
    assert.equal(publicSession.taskCheckpoint.status, "paused");
    assert.equal(Object.hasOwn(publicSession.taskCheckpoint, "taskKey"), false, "private resume linkage is not exposed to the browser");
    const sessionList = await request(appPort, "/api/sessions");
    assert.doesNotMatch(sessionList.body, new RegExp(savedCheckpoint.taskKey), "private resume linkage is not exposed in the sidebar API");
    assert.doesNotMatch(fs.readFileSync(store.DATA_FILE, "utf8"), /resume-test-key/, "provider credentials remain outside task/session state");

    autonomousScenario = true;
    callNumber = 0;
    requests.length = 0;
    const autonomousSession = JSON.parse((await request(appPort, "/api/sessions", "POST", { title: "Autonomous task" })).body).session.id;
    await requestAndDisconnect(appPort, `/api/sessions/${autonomousSession}`, { content: "Verify the autonomous local runner", mode: "build" });
    const deadline = Date.now() + 5_000;
    while (callNumber < 4 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(callNumber, 4, "the local worker should continue through another provider chunk after browser disconnect");
    assert.equal(store.taskCheckpoint(autonomousSession).status, "paused", "the worker's follow-up checkpoint survives without the browser");
    assert.ok(requests[2].messages.at(-1).content.includes("Continue the user's Build task autonomously"));
    const taskKey = store.taskCheckpoint(autonomousSession).taskKey;
    const memory = require("../server/task-memory");
    const savedNotes = memory.list(autonomousSession, taskKey);
    assert.ok(savedNotes.notes.length, "the first autonomous chunk saves its note: " + JSON.stringify(store.getSession(autonomousSession)?.messages.flatMap(m => m.events || []).filter(e => e.name?.startsWith("task_memory"))));
    assert.match(memory.read(autonomousSession, taskKey, "decisions").content, /approval boundaries/);
    assert.ok(requests[3].messages.some(message => message.role === "tool" && message.tool_call_id === "memory-read" && /approval boundaries/.test(message.content)), "the model can reload its private note after a provider chunk");
    const memoryEvents = store.getSession(autonomousSession).messages.flatMap(message => message.events || []).filter(event => event.name?.startsWith("task_memory"));
    assert.doesNotMatch(JSON.stringify(memoryEvents), /approval boundaries/, "private note contents are excluded from persisted chat-card events");

    contextScenario = true;
    callNumber = 0;
    requests.length = 0;
    const compacted = await provider.generate({
      system: "Keep the user's objective and verify evidence.",
      messages: [{ role: "user", content: "Implement the preserved objective: " + "oversized-history ".repeat(8_000) }],
      compaction: { anchorMessages: [{ role: "user", content: "Implement a resumable task runner and preserve its approval boundaries." }] }
    });
    assert.equal(callNumber, 1);
    assert.ok(JSON.stringify(requests[0]).length < 96_000, "the oversized transcript is compacted before the provider call");
    assert.match(JSON.stringify(requests[0].messages), /preserve its approval boundaries/);
    assert.ok(JSON.stringify(requests[0].messages).length < 20_000, "oversized user history is reduced to a short activity summary");
    assert.equal(compacted.compactions, 1);
    assert.ok(compacted.events.some(event => event.type === "status" && /compacted long-run context/i.test(event.text)));
    contextScenario = false;

    alwaysRequestTools = true;
    autonomousScenario = false;
    callNumber = 0;
    let executedTools = 0;
    const limitedRun = await provider.generate({
      system: "Test safe round limit",
      messages: [{ role: "user", content: "Continue a long task" }],
      tools: provider.TOOL_DEFINITIONS,
      executeTool: async () => { executedTools++; return { ok: true }; }
    });
    assert.equal(limitedRun.incomplete, true);
    assert.equal(limitedRun.rounds, 24);
    assert.equal(executedTools, 24, "work gets more than the old eight rounds, but remains bounded");
    assert.match(limitedRun.content, /paused at Sonderr's safe tool limit/i);
  } finally {
    await Promise.all([appServer, modelServer].map(server => new Promise(resolve => server.close(resolve))));
    fs.rmSync(temporaryHome, { recursive: true, force: true });
  }
  console.log("task resumption tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });

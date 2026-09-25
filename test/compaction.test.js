"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const http = require("node:http");
const { compactConversation, sizeOf } = require("../server/compaction");
const { parseTpmLimitError, parseTpmRetryAfter, maxTokensWithinTpm, isSmallDirectRequest, selectToolsForRequest, TOOL_DEFINITIONS } = require("../server/provider");

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

const skillHistory = compactConversation({
  messages: [
    { role: "assistant", tool_calls: [{ id: "skill-call", type: "function", function: { name: "load_skill", arguments: JSON.stringify({ id: "debugging" }) } }] },
    { role: "tool", name: "load_skill", tool_call_id: "skill-call", content: JSON.stringify({ id: "debugging", instructions: "PRIVATE_PLAYBOOK_TEXT ".repeat(500) }) },
    { role: "user", content: "Continue the task" }
  ],
  anchorMessages: [{ role: "user", content: "Debug the crash" }],
  maxChars: 4_000
});
assert.doesNotMatch(JSON.stringify(skillHistory.messages), /PRIVATE_PLAYBOOK_TEXT/, "context compaction drops loaded skill bodies but keeps concise task context");

const tighter = compactConversation({
  messages: longTranscript,
  anchorMessages: [{ role: "user", content: "Preserve this original objective and its constraints." }],
  checkpoint: { goal: "Keep the useful evidence", nextAction: "Continue safely" },
  maxChars: 4_000
});
assert.ok(sizeOf(tighter.messages) < 5_000, "emergency compaction supports a tighter provider budget");
assert.match(tighter.messages[0].content, /original objective and its constraints/i);

const tpm = parseTpmLimitError('Request too large on tokens per minute (TPM): Limit 8000, Requested 15794');
assert.deepEqual(tpm, { limit: 8000, requested: 15794 });
assert.equal(parseTpmLimitError("context length exceeded"), null);
assert.equal(parseTpmRetryAfter("Rate limit reached on tokens per minute (TPM): try again in 23.55s"), 23.55);
assert.equal(parseTpmRetryAfter("generic rate limit; retry in 23s"), null, "non-TPM 429 errors are not treated as a minute-window cooldown");
assert.equal(maxTokensWithinTpm({ limit: 8000, inputTokens: 7602, currentMaxTokens: 8192 }), 270);
assert.equal(maxTokensWithinTpm({ limit: 8000, inputTokens: 7900, currentMaxTokens: 8192 }), null);
assert.equal(isSmallDirectRequest("ask", "hello"), true, "greetings use the low-context path");
assert.equal(isSmallDirectRequest("ask", "What is a mutex?"), true, "small general questions use the low-context path");
assert.equal(isSmallDirectRequest("ask", "What is the current price of SOL?"), false, "current facts keep provider tools and normal context");
assert.equal(isSmallDirectRequest("ask", "Can you review this code?"), false, "workspace-dependent requests retain tools");
assert.equal(isSmallDirectRequest("build", "hello"), false, "implementation mode never loses its tools");
assert.equal(isSmallDirectRequest("ask", "Why?"), false, "follow-ups keep recent conversation context");
const workspaceAskTools = selectToolsForRequest("ask", "Read server/app.js and explain it").map(tool => tool.function.name);
assert.ok(workspaceAskTools.includes("read_workspace_file"));
assert.ok(workspaceAskTools.includes("search_workspace"));
assert.ok(!workspaceAskTools.some(name => name.startsWith("prepare_wallet")));
const walletAskTools = selectToolsForRequest("ask", "Show my ETH balance").map(tool => tool.function.name);
assert.ok(walletAskTools.includes("get_wallet_portfolio"));
assert.ok(!walletAskTools.some(name => name.startsWith("prepare_wallet")), "read-only wallet requests do not receive transaction tools");
const walletSendTools = selectToolsForRequest("ask", "Send 0.1 ETH to this address").map(tool => tool.function.name);
assert.ok(walletSendTools.includes("prepare_wallet_transaction"));
assert.equal(selectToolsForRequest("ask", "How does email work?").length, 0, "general questions do not receive action tools");
assert.equal(selectToolsForRequest("build", "hello").length, TOOL_DEFINITIONS.length, "Build mode retains the complete tool set");

(async () => {
  const requestBudgets = [];
  const requestBodies = [];
  const mockProvider = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      const parsed = JSON.parse(body);
      requestBodies.push(parsed);
      requestBudgets.push(parsed.max_tokens);
      if (requestBudgets.length === 1) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Rate limit reached on tokens per minute (TPM): try again in 0.01s" } }));
        return;
      }
      if (requestBudgets.length <= 4) {
        res.writeHead(413, { "Content-Type": "application/json" });
        const requested = requestBudgets.length === 2 ? 15794 : 9000;
        res.end(JSON.stringify({ error: { message: `Request too large for model in service tier on tokens per minute (TPM): Limit 8000, Requested ${requested}` } }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Recovered after TPM adjustment." }, finish_reason: "stop" }] }));
    });
  });
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-provider-budget-"));
  try {
    await new Promise(resolve => mockProvider.listen(0, "127.0.0.1", resolve));
    const port = mockProvider.address().port;
    const childCode = `require("./server/provider").generate({messages:[{role:"user",content:"hello"}],system:"long system context ".repeat(2000),tools:[{type:"function",function:{name:"test_tool",description:"A detailed tool description. ".repeat(100),parameters:{type:"object",properties:{path:{type:"string",description:"A detailed path description. ".repeat(100)}}}}}],compaction:{anchorMessages:[{role:"user",content:"Keep the original task intact."}]}}).then(r=>{if(!r.ok||r.content!=="Recovered after TPM adjustment.")process.exitCode=1;else console.log("provider retry passed")}).catch(e=>{console.error(e);process.exitCode=1})`;
    const child = spawn(process.execPath, ["-e", childCode], {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, HOME: tempHome, SONDERR_PROVIDER: "custom", SONDERR_MODEL: "test-model", SONDERR_API_BASE_URL: `http://127.0.0.1:${port}/v1`, SONDERR_API_KEY: "test-only" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    assert.equal(exitCode, 0, stderr || stdout);
    assert.equal(requestBudgets.length, 5, "timed TPM cooldown and bounded compaction stages run before recovery");
    assert.equal(requestBudgets[0], 8192);
    assert.equal(requestBudgets[1], 8192, "timed cooldown retries without changing the request");
    assert.equal(requestBudgets[2], 270, "413 retry reduces output to fit the reported estimate");
    assert.equal(requestBudgets[3], 128, "retry bottoms out at a small output budget when prompt tokens dominate");
    assert.equal(requestBudgets[4], 128);
    assert.ok(requestBodies[4].messages[0].content.length < requestBodies[0].messages[0].content.length, "emergency retry reduces the full system prompt");
    assert.ok(requestBodies[4].tools[0].function.description.length < requestBodies[0].tools[0].function.description.length, "emergency retry compacts tool descriptions but preserves schemas");
  } finally {
    await new Promise(resolve => mockProvider.close(resolve));
    fs.rmSync(tempHome, { recursive: true, force: true });
  }

  const skillRequests = [];
  let skillRunStart = 0;
  let autoCleanupOnly = false;
  const lifecycleProvider = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      skillRequests.push(JSON.parse(body));
      const n = skillRequests.length - skillRunStart;
      const toolCall = (id, name, skillId) => ({
        id,
        type: "function",
        function: { name, arguments: JSON.stringify({ id: skillId }) }
      });
      const message = n === 1
        ? { role: "assistant", content: null, tool_calls: [toolCall("load-1", "load_skill", "debugging")] }
        : n === 2 && !autoCleanupOnly
          ? { role: "assistant", content: null, tool_calls: [toolCall("unload-1", "unload_skill", "debugging")] }
          : { role: "assistant", content: "Finished the skill lifecycle test." };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message, finish_reason: n < (autoCleanupOnly ? 2 : 3) ? "tool_calls" : "stop" }] }));
    });
  });
  const skillHome = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-skill-lifecycle-"));
  try {
    await new Promise(resolve => lifecycleProvider.listen(0, "127.0.0.1", resolve));
    const port = lifecycleProvider.address().port;
    const skillCode = `const p=require("./server/provider");const events=[];p.generate({messages:[{role:"user",content:"debug this"}],system:"test",tools:[{type:"function",function:{name:"load_skill"}},{type:"function",function:{name:"unload_skill"}}],executeTool:async(name,input)=>name==="load_skill"?{id:input.id,name:"Debugging",category:"Code",instructions:"PRIVATE_PLAYBOOK_TEXT ".repeat(20)}:{id:input.id,name:"Debugging",unloaded:true},onEvent:e=>events.push(e)}).then(r=>{if(r.content!=="Finished the skill lifecycle test.")process.exitCode=1;else{console.log(JSON.stringify({events,conversation:r.conversation}))}}).catch(e=>{console.error(e);process.exitCode=1})`;
    const child = spawn(process.execPath, ["-e", skillCode], {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, HOME: skillHome, SONDERR_PROVIDER: "custom", SONDERR_MODEL: "test-model", SONDERR_API_BASE_URL: `http://127.0.0.1:${port}/v1`, SONDERR_API_KEY: "test-only" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    assert.equal(exitCode, 0, stderr || stdout);
    const run = JSON.parse(stdout.trim());
    assert.deepEqual(run.events.filter(e => e.type === "tool_start").map(e => e.name), ["load_skill", "unload_skill"], "skill lifecycle is visible as real tool calls");
    assert.doesNotMatch(JSON.stringify(run.events), /PRIVATE_PLAYBOOK_TEXT/, "skill instructions are never copied into visible tool cards");
    assert.match(skillRequests[1].messages.find(m => m.role === "tool" && m.name === "load_skill").content, /PRIVATE_PLAYBOOK_TEXT/, "loaded instructions enter provider context on demand");
    assert.doesNotMatch(JSON.stringify(skillRequests[2].messages), /PRIVATE_PLAYBOOK_TEXT/, "unload removes the detailed playbook from subsequent context");

    skillRunStart = skillRequests.length;
    autoCleanupOnly = true;
    const automaticCode = `const p=require("./server/provider");const events=[];p.generate({messages:[{role:"user",content:"debug this"}],system:"test",tools:[{type:"function",function:{name:"load_skill"}},{type:"function",function:{name:"unload_skill"}}],executeTool:async(name,input)=>name==="load_skill"?{id:input.id,name:"Debugging",category:"Code",instructions:"PRIVATE_PLAYBOOK_TEXT ".repeat(20)}:{id:input.id,name:"Debugging",unloaded:true},onEvent:e=>events.push(e)}).then(r=>console.log(JSON.stringify({events,conversation:r.conversation}))).catch(e=>{console.error(e);process.exitCode=1})`;
    const automaticChild = spawn(process.execPath, ["-e", automaticCode], {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, HOME: skillHome, SONDERR_PROVIDER: "custom", SONDERR_MODEL: "test-model", SONDERR_API_BASE_URL: `http://127.0.0.1:${port}/v1`, SONDERR_API_KEY: "test-only" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let automaticStdout = "", automaticStderr = "";
    automaticChild.stdout.setEncoding("utf8").on("data", chunk => { automaticStdout += chunk; });
    automaticChild.stderr.setEncoding("utf8").on("data", chunk => { automaticStderr += chunk; });
    const automaticExit = await new Promise((resolve, reject) => {
      automaticChild.once("error", reject);
      automaticChild.once("close", resolve);
    });
    assert.equal(automaticExit, 0, automaticStderr || automaticStdout);
    const automaticRun = JSON.parse(automaticStdout.trim());
    const automaticUnload = automaticRun.events.find(event => event.type === "tool_end" && event.name === "unload_skill");
    assert.ok(automaticUnload, "successful task cleanup emits an actual visible unload tool event");
    assert.equal(automaticUnload.output.automatic, true);
    assert.doesNotMatch(JSON.stringify(automaticRun.conversation), /PRIVATE_PLAYBOOK_TEXT/, "automatic unload removes the playbook from the retained provider conversation");
    assert.doesNotMatch(JSON.stringify(automaticRun.events), /PRIVATE_PLAYBOOK_TEXT/);
  } finally {
    await new Promise(resolve => lifecycleProvider.close(resolve));
    fs.rmSync(skillHome, { recursive: true, force: true });
  }
  console.log("context compaction and TPM retry tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });

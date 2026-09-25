"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

(async () => {
  const requests = [];
  const requestCounts = new Map();
  const server = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      const body = JSON.parse(raw);
      requests.push(body);
      const scenario = body.messages.some(item => item.role === "user" && item.content === "leak-check") ? "leak" : "success";
      const index = (requestCounts.get(scenario) || 0) + 1;
      requestCounts.set(scenario, index);
      const fakeCall = String.raw`I'll update the milestones.\<tool\_call>\<function=update_studio_board>\<parameter=goal>Updated goal\</parameter>`;
      const message = scenario === "leak"
        ? { role: "assistant", content: fakeCall }
        : index === 1
        ? { role: "assistant", content: fakeCall }
        : index === 2
          ? { role: "assistant", content: null, tool_calls: [{ id: "actual-board-call", type: "function", function: { name: "update_studio_board", arguments: JSON.stringify({ goal: "Updated goal" }) } }] }
          : { role: "assistant", content: "The board update succeeded." };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message, finish_reason: scenario === "success" && index === 2 ? "tool_calls" : "stop" }] }));
    });
  });
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-tool-recovery-"));
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const port = server.address().port;
    const childCode = `const p=require("./server/provider");const events=[];let executed=0;const scenario=process.env.RECOVERY_CASE;const tool={type:"function",function:{name:"update_studio_board",description:"Update the board",parameters:{type:"object",properties:{goal:{type:"string"}}}}};p.generate({messages:[{role:"user",content:scenario==="leak"?"leak-check":"Update the Studio brief"}],system:"Studio system",mode:"ask",tools:[tool],executeTool:async(name,input)=>{executed++;return {ok:true,goal:input.goal}},onEvent:event=>events.push(event)}).then(result=>{if(scenario==="success"&&(result.content!=="The board update succeeded."||executed!==1))throw Error("recovery did not execute one structured tool");if(scenario==="leak"&&(!/tool-call-shaped text/.test(result.content)||result.conversation.at(-1).content!==result.content||executed!==0))throw Error("fake tool markup escaped final/conversation sanitization");console.log(JSON.stringify({content:result.content,conversation:result.conversation,events,rounds:result.rounds}))}).catch(error=>{console.error(error);process.exitCode=1})`;
    async function runCase(scenario) {
      const child = spawn(process.execPath, ["-e", childCode], {
        cwd: path.resolve(__dirname, ".."),
        env: { ...process.env, HOME: tempHome, RECOVERY_CASE: scenario, SONDERR_PROVIDER: "custom", SONDERR_MODEL: "test-model", SONDERR_API_BASE_URL: `http://127.0.0.1:${port}/v1`, SONDERR_API_KEY: "test-only" },
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "", stderr = "";
      child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
      const exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
      assert.equal(exitCode, 0, stderr || stdout);
      return JSON.parse(stdout.trim());
    }
    const result = await runCase("success");
    assert.equal(requestCounts.get("success"), 3, "a single fake-call response gets one structured-tool retry plus the normal tool-result follow-up");
    assert.match(requests[1].messages[0].content, /Structured tool recovery/);
    assert.equal(requests[2].messages.find(message => message.role === "tool").name, "update_studio_board");
    assert.equal(result.events.filter(event => event.type === "tool_start").length, 1, "only the real call is shown as a tool action");
    assert.ok(result.events.some(event => event.type === "status" && /pretend tool syntax/.test(event.text)));
    assert.equal(result.content, "The board update succeeded.");
    const blockedLeak = await runCase("leak");
    assert.equal(requestCounts.get("leak"), 2, "the model gets one retry, then unsafe pseudo markup is blocked");
    assert.match(blockedLeak.content, /tool-call-shaped text/i);
    assert.equal(blockedLeak.conversation.at(-1).content, blockedLeak.content, "unsafe markup is not retained in the continuation conversation");
    assert.equal(blockedLeak.events.filter(event => event.type === "tool_start").length, 0, "pseudo markup never appears as an executed tool event");
    console.log("provider structured-tool recovery tests passed");
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

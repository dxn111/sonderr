"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-wallet-routing-"));
process.env.HOME = tempHome;
const store = require("../server/store");
const provider = require("../server/provider");
const wallet = require("../server/wallet");
const walletWatch = require("../server/wallet-watch");
const { createServer } = require("../server/app");

const originalGenerate = provider.generate;
const originalStatus = wallet.status;
const observed = { calls: [], statusRequests: [] };
provider.generate = async input => {
  observed.calls.push(input);
  const boardTool = (input.tools || []).find(tool => tool.function.name === "update_studio_board");
  if (boardTool) {
    const callId = "structured-board-update";
    const args = {
      goal: "Find practical ways to improve Sonderr",
      milestones: [
        { id: "explore", text: "Explore the codebase for improvement opportunities", done: false },
        { id: "feedback", text: "Review community feedback and prioritize ideas", done: true },
        { id: "explore", text: "Propose and test one scoped improvement", done: false }
      ]
    };
    const toolCall = { id: callId, type: "function", function: { name: "update_studio_board", arguments: JSON.stringify(args) } };
    const toolEvents = [];
    const emit = (type, payload) => { const event = { type, ...payload }; toolEvents.push(event); input.onEvent?.(event); };
    emit("tool_start", { id: callId, name: "update_studio_board", input: args });
    let output, failed = false;
    try { output = await input.executeTool("update_studio_board", args, emit); }
    catch (error) { failed = true; output = { error: error.message }; }
    emit("tool_end", { id: callId, name: "update_studio_board", input: args, output, failed, durationMs: 1 });
    const toolMessage = { role: "tool", tool_call_id: callId, name: "update_studio_board", content: JSON.stringify(output) };
    const assistantCall = { role: "assistant", content: null, tool_calls: [toolCall] };
    const content = failed ? "The board could not be updated." : "The board was updated from a verified local tool result.";
    return { ok: true, content, events: toolEvents, rounds: 1, incomplete: false, model: "wallet-routing-test", conversation: [...input.messages, assistantCall, toolMessage, { role: "assistant", content }] };
  }
  const result = input.messages.find(message => message.role === "tool" && message.name === "get_wallet_status");
  const content = result
    ? "Live wallet result received."
    : "Which network do you mean: Solana, Base, or Ethereum Mainnet?";
  return { ok: true, content, events: [], rounds: 0, incomplete: false, model: "wallet-routing-test", conversation: [...input.messages, { role: "assistant", content }] };
};
wallet.status = async input => {
  observed.statusRequests.push(input);
  return { chain: input.chain, networkId: input.network, network: input.network === "solana-mainnet" ? "Solana Mainnet" : "Solana Devnet", address: "PublicAddressForTest", balanceNative: "0.025", nativeSymbol: "SOL", slot: "42" };
};

function post(port, pathname, data) {
  return fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` },
    body: JSON.stringify(data)
  });
}

async function chat(port, sessionId, content) {
  const response = await post(port, `/api/sessions/${sessionId}`, { content, mode: "ask" });
  assert.equal(response.status, 200);
  const raw = await response.text();
  return raw.split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
}

(async () => {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  try {
    store.updateSettings({ ...store.settings(), approvalMode: "auto" });
    const session = store.createSession("Wallet follow-up regression");
    const firstTurn = await chat(port, session.id, "check the main net wallet");
    assert.equal(observed.statusRequests.length, 0, "an unqualified Mainnet prompt does not trigger an arbitrary all-wallet read");
    assert.ok(!observed.calls.at(-1).tools.some(tool => /^get_wallet_(?:accounts|status)$/.test(tool.function.name)), "the model is asked which Mainnet chain instead of being offered a guessing tool");
    assert.match(firstTurn.find(event => event.event === "final").message, /Which network/);

    const secondTurn = await chat(port, session.id, "sol");
    assert.deepEqual(observed.statusRequests, [{ chain: "solana", network: "solana-mainnet" }], "the short answer resolves the prior Mainnet question and reads only Solana Mainnet");
    const toolCard = secondTurn.find(event => event.event === "wallet_status");
    assert.equal(toolCard.networkId, "solana-mainnet");
    assert.equal(toolCard.balanceNative, "0.025");
    const providerRequest = observed.calls.at(-1);
    assert.ok(!providerRequest.tools.some(tool => tool.function.name === "get_wallet_status"), "the already-executed read cannot be duplicated by the model");
    const suppliedResult = providerRequest.messages.find(message => message.role === "tool" && message.name === "get_wallet_status");
    assert.match(suppliedResult.content, /solana-mainnet/);
    assert.match(suppliedResult.content, /0\.025/);
    assert.match(secondTurn.find(event => event.event === "final").message, /Live wallet result/);

    store.updateSettings({ ...store.settings(), approvalMode: "ask" });
    const approvalSession = store.createSession("Wallet approval boundary regression");
    const beforeApprovalCheck = observed.statusRequests.length;
    const approvalTurn = await chat(port, approvalSession.id, "check devnet solana");
    assert.equal(observed.statusRequests.length, beforeApprovalCheck, "deterministic reads never bypass the Ask approval setting");
    assert.ok(observed.calls.at(-1).tools.some(tool => tool.function.name === "get_wallet_status"), "with Ask enabled, the normal tool/approval flow remains available");
    assert.ok(approvalTurn.some(event => event.event === "final"));

    const boardSession = store.createSession("Developer improvement ideas", "studios", {
      track: "developer",
      goal: "Look for useful improvements",
      milestones: [
        { id: "explore", text: "Explore the codebase for improvement opportunities", done: false },
        { id: "feedback", text: "Review community feedback", done: true }
      ]
    });
    store.updateSettings({ ...store.settings(), approvalMode: "auto" });
    const boardTurn = await chat(port, boardSession.id, "Update my Studio brief and milestones to focus on exploring the codebase, reviewing feedback, and proposing a scoped improvement.");
    const updatedBoard = store.getSession(boardSession.id).studio;
    assert.equal(updatedBoard.goal, "Find practical ways to improve Sonderr");
    assert.equal(new Set(updatedBoard.milestones.map(item => item.id)).size, updatedBoard.milestones.length, "the real board update repairs repeated model-supplied IDs");
    assert.equal(updatedBoard.milestones[0].id, "explore", "existing IDs remain stable");
    assert.equal(updatedBoard.milestones[2].id === "explore", false, "a newly added milestone receives its own unique ID");
    assert.equal(updatedBoard.milestones[1].done, false, "rewriting a completed milestone cannot silently carry completion onto different work");
    assert.ok(boardTurn.some(event => event.event === "final" && /verified local tool result/.test(event.message)));
    console.log("wallet chat routing integration tests passed");
  } finally {
    provider.generate = originalGenerate;
    wallet.status = originalStatus;
    await new Promise(resolve => server.close(resolve));
    walletWatch.stop();
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

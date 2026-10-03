"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const safety = require("../server/safety");

const temporaryHome = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-store-test-"));
process.env.HOME = temporaryHome;
const store = require("../server/store");

try {
  store.updateSettings({ provider: "custom", baseURL: "https://provider.example/v1", model: "test-model", apiKey: "test-key-that-must-not-live-in-settings" });
  const publicSettings = store.settings();
  const rawSettings = fs.readFileSync(store.DATA_FILE, "utf8");
  const rawCredentials = fs.readFileSync(store.CREDENTIALS_FILE, "utf8");
  assert.equal(Object.hasOwn(publicSettings, "apiKey"), false);
  assert.equal(rawSettings.includes("test-key-that-must-not-live-in-settings"), false);
  assert.equal(rawCredentials.includes("test-key-that-must-not-live-in-settings"), true);
  assert.equal(store.providerKey("custom"), "test-key-that-must-not-live-in-settings");
  const tpmProfile = "custom\nhttps://private-provider.example/v1\ncompact-model";
  assert.equal(store.rememberProviderTpmLimit(tpmProfile, 8_000, Date.now() + 60_000), true);
  assert.equal(store.providerTpmLimit(tpmProfile), 8_000, "recent provider TPM ceilings persist for future local runs");
  const afterTpmSave = fs.readFileSync(store.DATA_FILE, "utf8");
  assert.equal(afterTpmSave.includes("private-provider.example"), false, "TPM profile persistence stores only a one-way profile hash");
  assert.equal(Object.hasOwn(store.settings(), "providerTpmLimits"), false, "internal provider limits are not exposed as ordinary settings");

  store.updateWalletConfig({ chain: "evm", network: "Base Mainnet · low fees", rpcUrl: "https://mainnet.base.org", address: "0x1111111111111111111111111111111111111111" });
  store.updateWalletConfig({ chain: "solana", network: "Solana Mainnet · low fees", rpcUrl: "https://api.mainnet-beta.solana.com", address: "11111111111111111111111111111111" });
  const walletConfig = store.walletConfig();
  assert.equal(walletConfig.activeChain, "solana");
  assert.equal(walletConfig.wallets.evm.address, "0x1111111111111111111111111111111111111111");
  assert.equal(walletConfig.wallets.solana.address, "11111111111111111111111111111111");
  store.saveWalletPortfolioSnapshot({ chain: "evm", network: "Base Mainnet", totalUsd: 10 }, "evm:Base");
  store.saveWalletPortfolioSnapshot({ chain: "evm", network: "Ethereum Mainnet", totalUsd: 20 }, "evm:Ethereum");
  assert.equal(store.walletPortfolioSnapshot("evm:Base").totalUsd, 10);
  assert.equal(store.walletPortfolioSnapshot("evm:Ethereum").totalUsd, 20);

  const opportunity = store.saveEarningOpportunity({
    title: "Solana example faucet",
    category: "faucet",
    network: "solana-mainnet",
    status: "candidate",
    sources: ["https://faucet.example/rules", "http://unsafe.example/", "https://evil.example/?api_key=do-not-save"],
    amount: "0.001",
    currency: "SOL",
    eligibility: "One claim per day; verify current terms",
    evidence: "Official page states a cooldown; payout not verified",
    nextCheckAt: "2026-09-26T12:00:00Z"
  });
  assert.equal(opportunity.sources.length, 1, "ledger accepts only safe HTTPS source URLs without credential-like parameters");
  assert.equal(opportunity.status, "candidate", "a research lead is not mislabeled as submitted or paid");
  assert.equal(store.listEarningOpportunities().length, 1, "earning ledger persists locally");
  const updatedOpportunity = store.saveEarningOpportunity({ id: opportunity.id, status: "eligible", evidence: "Terms checked; identity requirements still unknown" });
  assert.equal(updatedOpportunity.id, opportunity.id, "updating an entry preserves its stable ID");
  assert.equal(store.listEarningOpportunities().length, 1, "updates do not create duplicate entries");
  assert.equal(store.saveEarningOpportunity({ title: "Secret API_KEY=do-not-persist", category: "other" }).title, "Secret API_KEY=[redacted by Sonderr safety]", "ledger notes redact secret-like text");
  assert.throws(() => store.saveEarningOpportunity({ title: "bad date", nextCheckAt: "not a date" }), /ISO date\/time/);

  const session = store.createSession("A safe title\nwithout a second line");
  assert.equal(session.title.includes("\n"), false);
  assert.equal(session.surface, "chat");
  const studioSession = store.createSession("A coached project", "studios");
  assert.equal(store.getSession(studioSession.id).surface, "studios", "Studios sessions persist their dedicated surface");
  assert.equal(store.updateStudio(studioSession.id, { track: "bounty", goal: "Test safely", milestones: [{ text: "Read scope", done: true }] }).studio.milestones[0].done, true);
  const duplicateId = "milestone-duplicate";
  const dedupedBoard = store.updateStudio(studioSession.id, { track: "developer", goal: "Find useful improvements", milestones: [
    { id: duplicateId, text: "Explore the codebase", done: false },
    { id: duplicateId, text: "Review user feedback", done: false },
    { id: "milestone-last", text: "Test a contribution", done: true }
  ] }).studio;
  assert.equal(new Set(dedupedBoard.milestones.map(item => item.id)).size, dedupedBoard.milestones.length, "board persistence repairs duplicate milestone IDs");
  assert.equal(dedupedBoard.milestones[0].id, duplicateId, "the first stable ID is preserved");
  assert.notEqual(dedupedBoard.milestones[1].id, duplicateId, "a duplicate ID is replaced with a unique local ID");
  assert.equal(dedupedBoard.milestones[2].done, true, "deduplication preserves other completion states");
  assert.equal(store.getSession(studioSession.id).studio.track, "developer");
  assert.equal(store.updateStudio(session.id, { goal: "Should not convert chat" }), null, "ordinary chats cannot become Studio projects by update");
  assert.equal(store.createSession("Untrusted surface", "admin").surface, "chat", "unknown surfaces fail back to ordinary chat");
  assert.equal(store.setSessionPlugin(session.id, "sites"), "sites");
  assert.equal(store.getSession(session.id).activePluginId, "sites", "active plugin persists per chat");
  assert.equal(store.setSessionPlugin(session.id, ""), "", "plugin can be removed from a chat");
  for (let index = 0; index < 242; index++) store.addMessage(session.id, "user", "message-" + index);
  const saved = store.getSession(session.id);
  assert.equal(saved.messages.length, 240);
  assert.equal(saved.messages[0].content, "message-2");
  assert.throws(() => store.addMessage(session.id, "tool", "not a visible chat role"), /Invalid message role/);

  const legacyLeakSession = store.createSession("Old transcript");
  const pseudoToolDump = String.raw`I'll update the milestones.\<tool\_call\>\<function=update_studio_board\>`;
  store.addMessage(legacyLeakSession.id, "assistant", pseudoToolDump);
  store.addMessage(legacyLeakSession.id, "user", 'I pasted API_KEY="sk-proj-abcdefghijklmnopqrstuvwxyz0123456789"');
  let cleanLegacy = store.getSession(legacyLeakSession.id);
  assert.match(cleanLegacy.messages[0].content, /tool-call-shaped text/i, "unsafe pseudo tool syntax is removed before persistence");
  assert.ok(cleanLegacy.messages[1].content.includes(safety.REDACTION), "credential strings in user turns are scrubbed before persistence");
  const legacyDb = JSON.parse(fs.readFileSync(store.DATA_FILE, "utf8"));
  const legacyRecord = legacyDb.sessions.find(item => item.id === legacyLeakSession.id);
  legacyRecord.messages[0].content = 'Here is a fake {"tool_calls":[{"function":{"name":"update_studio_board"}}]}';
  legacyRecord.messages[1].content = "old secret sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";
  fs.writeFileSync(store.DATA_FILE, JSON.stringify(legacyDb));
  cleanLegacy = store.getSession(legacyLeakSession.id);
  assert.match(cleanLegacy.messages[0].content, /tool-call-shaped text/i, "transcripts written by old releases are scrubbed on read");
  assert.ok(cleanLegacy.messages[1].content.includes(safety.REDACTION), "legacy credentials are scrubbed before APIs or prompts can use them");

  const checkpoint = store.setTaskCheckpoint(session.id, {
    taskKey: "task-resume-key",
    goal: "Finish a multi-stage feature",
    status: "paused",
    currentMilestone: "Verify the implementation",
    verified: ["server/app.js changed", "npm test passed", "secret-like API_KEY=do-not-persist"],
    decisions: ["Keep the patch workspace-scoped"],
    nextAction: "Inspect the final diff and rerun the focused test"
  });
  assert.equal(checkpoint.status, "paused");
  assert.equal(store.taskCheckpoint(session.id).nextAction, "Inspect the final diff and rerun the focused test");
  assert.equal(checkpoint.verified.length, 3, "checkpoint lists preserve concise evidence entries");
  assert.match(checkpoint.verified[2], /\[redacted by Sonderr safety\]/);
  assert.equal(store.pauseTaskCheckpoint(session.id, "different-task").status, "paused", "pausing another task must not alter this checkpoint");
  assert.equal(store.pauseTaskCheckpoint(session.id, "task-resume-key").status, "paused");
  const completedCheckpoint = store.setTaskCheckpoint(session.id, { ...checkpoint, status: "completed", nextAction: "should be cleared" });
  assert.equal(completedCheckpoint.nextAction, "", "completed work has no resume action");
  store.setTaskCheckpoint(session.id, { ...completedCheckpoint, status: "active", currentMilestone: "Long autonomous run", nextAction: "Continue in local process" });
  assert.equal(store.pauseInterruptedTaskCheckpoints(), true, "startup should recover tasks left active by a stopped process");
  const interrupted = store.taskCheckpoint(session.id);
  assert.equal(interrupted.status, "paused");
  assert.ok(interrupted.interruptedAt);
  assert.match(interrupted.nextAction, /Sonderr stopped/i);
  assert.equal(store.pauseInterruptedTaskCheckpoints(), false, "recovery should be idempotent");
  assert.equal(store.setTaskCheckpoint("missing-session", checkpoint), null);

  // --- Corruption handling tests ---
  fs.writeFileSync(store.DATA_FILE, "not valid json{{{");
  const sessionsAfterDataCorruption = store.listSessions();
  const dataBakFiles = fs.readdirSync(store.DATA_DIR).filter(name => name.startsWith("data.json.") && name.endsWith(".bak"));
  assert.ok(dataBakFiles.length > 0, "read() should create a .bak file when data.json contains invalid JSON");
  assert.deepEqual(sessionsAfterDataCorruption, [], "after data.json corruption, read() should return a fresh store with empty sessions");

  fs.writeFileSync(store.CREDENTIALS_FILE, "not valid json{{{");
  const credsAfterCorruption = store.credentials();
  const credBakFiles = fs.readdirSync(store.DATA_DIR).filter(name => name.startsWith("credentials.json.") && name.endsWith(".bak"));
  assert.ok(credBakFiles.length > 0, "credentials() should create a .bak file when credentials.json contains invalid JSON");
  assert.deepEqual(credsAfterCorruption, {}, "after credentials.json corruption, credentials() should return an empty object");

  // --- Temp file naming tests ---
  const capturedTempPaths = [];
  const originalRenameSync = fs.renameSync;
  try {
    fs.renameSync = function(from, to) {
      if (String(from).startsWith(store.DATA_FILE) && String(from).includes(".tmp-")) {
        capturedTempPaths.push(from);
      }
      return originalRenameSync(from, to);
    };
    store.write({ sessions: [] });
    store.write({ sessions: [] });
  } finally {
    fs.renameSync = originalRenameSync;
  }
  assert.ok(capturedTempPaths.length >= 2, "write() should use temp files for consecutive writes");
  capturedTempPaths.forEach(tempPath => {
    const tempSuffix = tempPath.slice(store.DATA_FILE.length);
    assert.ok(tempSuffix.startsWith(".tmp-"), "temp file should start with .tmp-");
    assert.ok(/^\.tmp-[0-9a-f-]{36}$/.test(tempSuffix), "temp file should have a UUID suffix");
  });
  assert.notEqual(capturedTempPaths[0], capturedTempPaths[1], "consecutive writes should use different temp paths");
} finally {
  fs.rmSync(temporaryHome, { recursive: true, force: true });
}

console.log("store tests passed");

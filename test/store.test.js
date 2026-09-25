"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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
  assert.equal(store.setSessionPlugin(session.id, "sites"), "sites");
  assert.equal(store.getSession(session.id).activePluginId, "sites", "active plugin persists per chat");
  assert.equal(store.setSessionPlugin(session.id, ""), "", "plugin can be removed from a chat");
  for (let index = 0; index < 242; index++) store.addMessage(session.id, "user", "message-" + index);
  const saved = store.getSession(session.id);
  assert.equal(saved.messages.length, 240);
  assert.equal(saved.messages[0].content, "message-2");
  assert.throws(() => store.addMessage(session.id, "tool", "not a visible chat role"), /Invalid message role/);

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
} finally {
  fs.rmSync(temporaryHome, { recursive: true, force: true });
}

console.log("store tests passed");

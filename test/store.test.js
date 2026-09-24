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

  const session = store.createSession("A safe title\nwithout a second line");
  assert.equal(session.title.includes("\n"), false);
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

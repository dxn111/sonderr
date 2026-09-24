"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-wallet-watch-"));
const watcher = require("../server/wallet-watch");
const { findIncreases } = watcher;

const snapshot = (native, token, options = {}) => ({
  chain: "evm",
  network: "Base Mainnet · low fees",
  address: "0x0000000000000000000000000000000000000001",
  tokenBalancesAvailable: options.tokenBalancesAvailable !== false,
  assets: [
    { kind: "native", symbol: "ETH", amountBaseUnits: String(native), decimals: 18 },
    ...(token == null ? [] : [{ kind: "erc20", tokenAddress: "0x0000000000000000000000000000000000000002", symbol: "TOK", amountBaseUnits: String(token), decimals: 6 }])
  ]
});

(async () => {
  assert.deepEqual(findIncreases(null, snapshot("100", "100")), [], "first poll establishes a baseline without false deposit alerts");
  assert.deepEqual(findIncreases(snapshot("100", "100"), snapshot("150", "75")).map(event => [event.kind, event.amountBaseUnits]), [["native", "50"]], "only positive net balance movement is reported");
  assert.deepEqual(findIncreases(snapshot("100", "100"), snapshot("100", "100")), [], "unchanged balances do not create events");
  assert.deepEqual(findIncreases(snapshot("100", "100"), snapshot("90", "50")), [], "outgoing movement is not misreported as a deposit");
  assert.deepEqual(findIncreases(snapshot("100", "100", { tokenBalancesAvailable: false }), snapshot("150", "150")).map(event => event.kind), ["native"], "token index gaps do not create false token receipt claims");

  assert.equal((await watcher.setEnabled(true)).enabled, true, "watching can be enabled and persisted");
  assert.equal((await watcher.setEnabled(false)).enabled, false, "watching can be disabled and its poller stopped");
  console.log("wallet watch balance-delta tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });

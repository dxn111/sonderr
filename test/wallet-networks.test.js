"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-wallet-networks-"));
const wallet = require("../server/wallet");

assert.deepEqual(wallet.networkCatalog("evm").map(item => item.id), ["base-mainnet", "ethereum-mainnet", "base-sepolia", "sepolia"]);
assert.deepEqual(wallet.networkCatalog("solana").map(item => item.id), ["solana-mainnet", "solana-devnet", "solana-testnet"]);
assert.equal(wallet.builtInNetwork("evm", "sepolia").chainId, 11155111);
assert.equal(wallet.builtInNetwork("evm", "base-sepolia").chainId, 84532);
assert.equal(wallet.builtInNetwork("solana", "devnet").cluster, "devnet");
assert.equal(wallet.builtInNetwork("solana", "testnet").cluster, "testnet");
assert.throws(() => wallet.builtInNetwork("evm", "devnet"), /Unsupported evm network/);
assert.throws(() => wallet.builtInNetwork("solana", "base-sepolia"), /Unsupported solana network/);
assert.deepEqual(wallet.inferNetworkFromText("check my Solana devnet balance", "evm", "base-mainnet"), { chain: "solana", networkId: "solana-devnet" });
assert.deepEqual(wallet.inferNetworkFromText("check devnet", "evm", "base-mainnet"), { chain: "solana", networkId: "solana-devnet" });
assert.deepEqual(wallet.resolveExplicitToolNetwork("get_wallet_accounts", { chain: "evm", network: "base-mainnet" }, "check my devnet balance"), { name: "get_wallet_status", inferred: { chain: "solana", networkId: "solana-devnet" }, input: { chain: "solana", network: "solana-devnet" } });
assert.deepEqual(wallet.resolveExplicitToolNetwork("get_wallet_status", { chain: "solana", network: "solana-mainnet" }, "check my Solana devnet balance"), { name: "get_wallet_status", inferred: { chain: "solana", networkId: "solana-devnet" }, input: { chain: "solana", network: "solana-devnet" } });
assert.equal(wallet.resolveExplicitToolNetwork("get_wallet_accounts", {}, "show my Solana wallet address").name, "get_wallet_accounts", "a family-only request keeps the all-account lookup");
assert.deepEqual(wallet.inferNetworkFromText("what is my Base Sepolia balance?", "evm"), { chain: "evm", networkId: "base-sepolia" });
assert.deepEqual(wallet.inferNetworkFromText("check my Base balance", "solana"), { chain: "evm", networkId: "base-mainnet" });
assert.deepEqual(wallet.inferNetworkFromText("check Ethereum", "solana"), { chain: "evm", networkId: "ethereum-mainnet" });
assert.deepEqual(wallet.inferNetworkFromText("check my Solana mainnet", "solana"), { chain: "solana", networkId: "solana-mainnet" });
assert.deepEqual(wallet.inferNetworkFromText("Ethereum mainnet and Base mainnet", "evm", "base-mainnet"), { chain: "evm", networkId: "base-mainnet" });
assert.throws(() => wallet.inferNetworkFromText("check my testnet balance", "evm"), /Which testnet do you mean/);
assert.throws(() => wallet.inferNetworkFromText("check my ETH balance", "evm"), /ETH exists on multiple EVM networks/);
assert.throws(() => wallet.inferNetworkFromText("check Ethereum and Solana balances"), /Use get_wallet_accounts/);

const changed = wallet.setNetwork("evm", "sepolia");
assert.equal(changed.activeNetworks.evm, "sepolia");
assert.equal(changed.networkId, "sepolia");
assert.equal(changed.supportedNetworks.find(item => item.id === "sepolia").testnet, true);
assert.equal(wallet.publicConfig().activeNetworks.solana, "solana-mainnet");

Promise.all([
  wallet.latestPrice({ chain: "evm", network: "sepolia" }),
  wallet.latestPrice({ chain: "solana", network: "solana-devnet" }),
  wallet.marketSnapshot({ chain: "evm", network: "base-sepolia", tokenAddress: "0x0000000000000000000000000000000000000001" })
]).then(prices => {
  for (const price of prices.slice(0, 2)) {
    assert.equal(price.priceUsd, null);
    assert.match(price.unavailableReason, /no real-world market price/i);
  }
  assert.equal(prices[2].pairs.length, 0, "market lookups never assign real liquidity or value to testnet tokens");
  assert.match(prices[2].unavailableReason, /unavailable on testnets/i);

  const originalFetch = global.fetch, token = "0x0000000000000000000000000000000000000001";
  const pair = (pairAddress, chainId, baseAddress, liquidity) => ({ chainId, pairAddress, dexId: "test-dex", baseToken: { address: baseAddress, symbol: "TKN" }, quoteToken: { address: "0x0000000000000000000000000000000000000002", symbol: "USD" }, priceUsd: "1.25", liquidity: { usd: liquidity }, volume: { h24: 200 }, marketCap: 1000, fdv: 1200, priceChange: { h24: 3.5 }, txns: { h24: { buys: 8, sells: 4 } }, pairCreatedAt: 1700000000000 });
  global.fetch = async () => ({ ok: true, json: async () => [pair("pool-low", "base", token, 100), pair("pool-high", "base", token, 500), pair("wrong-chain", "ethereum", token, 9000)] });
  return wallet.marketSnapshot({ chain: "evm", network: "base-mainnet", tokenAddress: token }).then(snapshot => {
    assert.equal(snapshot.pairCount, 2, "pools from a different network are excluded");
    assert.equal(snapshot.pairs[0].pairAddress, "pool-high", "pools are sorted by reported liquidity");
    assert.equal(snapshot.pairs[0].assetPriceUsd, 1.25);
    assert.equal(snapshot.pairs[0].priceChangePct.h24, 3.5);
  }).finally(() => { global.fetch = originalFetch; });
}).then(() => {
  console.log("wallet network tests passed");
}).catch(error => { console.error(error); process.exitCode = 1; });

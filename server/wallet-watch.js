"use strict";

const { ethers } = require("ethers");
const wallet = require("./wallet");
const store = require("./store");

const POLL_INTERVAL_MS = 60_000;
let timer = null;
let polling = false;
let lastPolledAt = null;
let lastError = null;

function snapshotKey(snapshot) {
  return [snapshot.chain, snapshot.network, snapshot.address].join(":");
}

function assetKey(asset) {
  return asset.kind === "native" ? "native" : String(asset.tokenAddress || "").toLowerCase();
}

function findIncreases(previous, current) {
  if (!previous) return [];
  const before = new Map((previous?.assets || []).map(asset => [assetKey(asset), asset]));
  const increases = [];
  for (const asset of current.assets || []) {
    const id = assetKey(asset);
    if (!id || (asset.kind !== "native" && !asset.tokenAddress)) continue;
    if (asset.kind !== "native" && (previous?.tokenBalancesAvailable === false || current.tokenBalancesAvailable === false)) continue;
    let delta;
    try { delta = BigInt(asset.amountBaseUnits || "0") - BigInt(before.get(id)?.amountBaseUnits || "0"); }
    catch { continue; }
    if (delta <= 0n) continue;
    const decimals = Number.isInteger(asset.decimals) && asset.decimals >= 0 && asset.decimals <= 255 ? asset.decimals : 0;
    increases.push({
      chain: current.chain,
      network: current.network,
      address: current.address,
      kind: asset.kind,
      symbol: asset.symbol || (asset.kind === "native" ? (current.chain === "solana" ? "SOL" : "ETH") : "token"),
      tokenAddress: asset.tokenAddress || null,
      amountBaseUnits: delta.toString(),
      amount: ethers.formatUnits(delta, decimals),
      note: "Net balance increase observed between local polls. Check transaction activity for the on-chain details."
    });
  }
  return increases;
}

async function poll() {
  if (polling || !store.walletWatchState().enabled) return state();
  polling = true;
  try {
    const configured = wallet.publicConfig().accounts;
    const networks = configured.filter((item, index, list) => list.findIndex(other => other.chain === item.chain && other.network === item.network) === index);
    let saved = store.walletWatchState();
    const snapshots = { ...saved.snapshots };
    let hadError = false;
    for (const item of networks) {
      if (!store.walletWatchState().enabled) return state();
      try {
        const current = await wallet.balanceSnapshot({ chain: item.chain, network: item.network });
        if (!store.walletWatchState().enabled) return state();
        const key = snapshotKey(current), previous = snapshots[key];
        if (previous) for (const increase of findIncreases(previous, current)) store.addWalletWatchEvent(increase);
        snapshots[key] = current;
      } catch (error) {
        hadError = true;
        lastError = String(error?.message || "A public chain endpoint could not be reached").slice(0, 180);
      }
    }
    const latest = store.walletWatchState();
    if (!latest.enabled) return state();
    store.updateWalletWatch({ enabled: latest.enabled, snapshots, events: latest.events });
    lastPolledAt = new Date().toISOString();
    if (!hadError) lastError = null;
  } finally {
    polling = false;
  }
  return state();
}

function start() {
  if (!store.walletWatchState().enabled) return state();
  if (!timer) {
    timer = setInterval(() => { poll().catch(error => { lastError = String(error?.message || "Wallet watch poll failed").slice(0, 180); }); }, POLL_INTERVAL_MS);
    timer.unref?.();
  }
  poll().catch(error => { lastError = String(error?.message || "Wallet watch poll failed").slice(0, 180); });
  return state();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  store.updateWalletWatch({ enabled: false });
  return state();
}

async function setEnabled(enabled) {
  if (enabled) {
    store.updateWalletWatch({ enabled: true });
    start();
    return state();
  }
  return stop();
}

function state() {
  const saved = store.walletWatchState();
  return {
    enabled: saved.enabled,
    walletConfigured: wallet.publicConfig().accounts.length > 0,
    intervalSeconds: POLL_INTERVAL_MS / 1000,
    lastPolledAt,
    lastError,
    events: saved.events.slice(-20).reverse(),
    note: "Best-effort local balance polling using built-in public endpoints. The first poll establishes a baseline; deposits made and spent between later polls, unindexed assets, endpoint outages, or rate limits may be missed. Verify important receipts on the chain explorer. Sonderr must remain running to watch."
  };
}

module.exports = { POLL_INTERVAL_MS, findIncreases, poll, start, stop, setEnabled, state };

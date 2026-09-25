"use strict";

const assert = require("node:assert/strict");
const faucets = require("../server/faucets");

const result = faucets.listSolFaucets();
assert.equal(result.checkedAt, "2026-09-25");
assert.ok(result.sources.length >= 4, "list should show candidates and explicit exclusions");
assert.equal(result.sources.filter(item => item.canOpenClaim).length, 1, "only the single manual-review Mainnet candidate gets an action button");
assert.equal(result.sources.find(item => item.id === "togatech-sol-faucet").network, "Solana Mainnet");
assert.match(result.sources.find(item => item.id === "togatech-sol-faucet").requirements, /0\.00089088 SOL/);
assert.match(result.sources.find(item => item.id === "solfaucet-fun").status, /Excluded/);
assert.match(result.sources.find(item => item.id === "stakely-sol-faucet").status, /inactive/);
assert.match(result.sources.find(item => item.id === "solana-official-faucet").network, /Devnet/);
assert.match(result.note, /does not fill forms, submit claims, solve CAPTCHA/i);
for (const source of result.sources) {
  assert.ok(source.sources.every(url => url.startsWith("https://")), "sources use HTTPS");
  assert.ok(source.claimUrl.startsWith("https://"), "claim links use HTTPS");
}
const provider = require("../server/provider");
const names = provider.TOOL_DEFINITIONS.map(tool => tool.function.name);
assert.ok(names.includes("list_sol_faucets"));
assert.equal(names.includes("faucet_claim"), false, "there is no automated submit-claims tool");
console.log("faucet research catalog tests passed");

"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), "sonderr-http-security-"));
const updates = require("../server/updates");
const store = require("../server/store");
const { createServer } = require("../server/app");

function request(port, { path = "/", method = "GET", headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method, headers }, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  try {
    const homepage = await request(port);
    assert.equal(homepage.status, 200);
    assert.match(homepage.headers["content-security-policy"], /default-src 'self'/);
    assert.equal(homepage.headers["x-frame-options"], "DENY");
    const history = store.createSession("Output boundary test");
    const fakeWalletToken = "b".repeat(48);
    store.addMessage(history.id, "assistant", 'Fake {"tool_calls":[{"function":{"name":"write_file"}}]} and API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz0123456789', {
      events: [{ type: "tool_end", name: "other_tool", output: { access_token: "must-not-leak" } }, { type: "tool_end", name: "prepare_wallet_transaction", output: { token: fakeWalletToken, expiresAt: Date.now() + 20_000 } }]
    });
    const sessionList = await request(port, { path: "/api/sessions/" + history.id });
    assert.equal(sessionList.body.includes("sk-proj-abcdefghijklmnopqrstuvwxyz0123456789"), false, "JSON APIs never return saved provider keys");
    assert.equal(sessionList.body.includes('"tool_calls"'), false, "unsafe pseudo-call transcripts are not returned as assistant actions");
    assert.equal(sessionList.body.includes("must-not-leak"), false, "nested event credentials are removed at the JSON boundary");
    assert.equal(sessionList.body.includes(fakeWalletToken), true, "only the exact short-lived local wallet confirmation card can retain its action token");
    const studiosPage = await request(port, { path: "/studios" });
    assert.equal(studiosPage.status, 200);
    assert.match(studiosPage.body, /id="studiosHome"/);
    const bountyPage = await request(port, { path: "/docs/bounty" });
    const developerPage = await request(port, { path: "/docs/developer" });
    assert.match(bountyPage.body, /data-program-assistant="bounty"/);
    assert.match(bountyPage.body, /Safe testing and coordinated disclosure/);
    assert.match(developerPage.body, /data-program-assistant="developer"/);
    assert.match(developerPage.body, /Proposal template for bigger work/);
    assert.equal((await request(port, { path: "/docs-help.js" })).status, 200, "program helper script is served locally");
    assert.equal((await request(port, { path: "/docs-help.css" })).status, 200, "program helper styles are served locally");
    const developmentUpdateCheck = await request(port, { path: "/api/update-check" });
    assert.equal(developmentUpdateCheck.status, 200);
    assert.equal(JSON.parse(developmentUpdateCheck.body).status, "development", "a source checkout is never force-updated over local changes");
    const originalUpdateCheck = updates.checkForUpdate;
    updates.checkForUpdate = async () => ({ status: "update-required", currentVersion: "1.5.9", latestVersion: "1.5.10", latestTag: "v1.5.10", updateAvailable: true });
    const blockedWorkspaceApi = await request(port, { path: "/api/sessions" });
    assert.equal(blockedWorkspaceApi.status, 426, "the server blocks workspace APIs, not only the visible UI, while an update is required");
    const allowedUpdateMetadata = await request(port, { path: "/api/update-check" });
    assert.equal(allowedUpdateMetadata.status, 200, "the gate keeps only health/update endpoints available");
    updates.checkForUpdate = originalUpdateCheck;
    const trustedHeaders = { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` };
    const createdStudio = await request(port, { path: "/api/sessions", method: "POST", headers: trustedHeaders, body: JSON.stringify({ title: "Studio smoke", surface: "studios", studio: { track: "developer", goal: "Ship a small fix", milestones: [{ text: "Inspect the code" }] } }) });
    assert.equal(createdStudio.status, 201);
    const studioId = JSON.parse(createdStudio.body).session.id;
    const updatedStudio = await request(port, { path: `/api/studios/projects/${studioId}`, method: "POST", headers: trustedHeaders, body: JSON.stringify({ studio: { track: "developer", goal: "Ship a tested fix", milestones: [{ text: "Inspect the code", done: true }] } }) });
    assert.equal(updatedStudio.status, 200);
    assert.equal(JSON.parse(updatedStudio.body).session.studio.milestones[0].done, true);
    const reloadedStudio = await request(port, { path: `/api/sessions/${studioId}` });
    assert.equal(JSON.parse(reloadedStudio.body).session.studio.goal, "Ship a tested fix");

    const blockedHost = await request(port, { path: "/api/health", headers: { Host: "untrusted.example" } });
    assert.equal(blockedHost.status, 403);

    const blockedOrigin = await request(port, { path: "/api/sessions", method: "POST", headers: { "Content-Type": "application/json", Origin: "https://untrusted.example" }, body: "{}" });
    assert.equal(blockedOrigin.status, 403);

    const originlessWalletConfirmation = await request(port, { path: "/api/wallet/confirm", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "not-a-real-token" }) });
    assert.equal(originlessWalletConfirmation.status, 403);
    const trustedWalletConfirmation = await request(port, { path: "/api/wallet/confirm", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ token: "not-a-real-token" }) });
    assert.equal(trustedWalletConfirmation.status, 502);
    const originlessSwapConfirmation = await request(port, { path: "/api/wallet/swap/confirm", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "not-a-real-token" }) });
    assert.equal(originlessSwapConfirmation.status, 403);
    const trustedSwapConfirmation = await request(port, { path: "/api/wallet/swap/confirm", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ token: "not-a-real-token" }) });
    assert.equal(trustedSwapConfirmation.status, 502);

    const originlessWalletNetwork = await request(port, { path: "/api/wallet/network", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chain: "evm", network: "sepolia" }) });
    assert.equal(originlessWalletNetwork.status, 403);
    const trustedWalletNetwork = await request(port, { path: "/api/wallet/network", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ chain: "evm", network: "sepolia" }) });
    assert.equal(trustedWalletNetwork.status, 200);
    assert.equal(JSON.parse(trustedWalletNetwork.body).wallet.activeNetworks.evm, "sepolia");
    const invalidWalletNetwork = await request(port, { path: "/api/wallet/network", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ chain: "evm", network: "devnet" }) });
    assert.equal(invalidWalletNetwork.status, 400, "an unsupported network must not silently fall back to mainnet");

    const originlessTokenDiscovery = await request(port, { path: "/api/trading/discover", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ network: "base-mainnet", query: "PEPE" }) });
    assert.equal(originlessTokenDiscovery.status, 403, "token discovery is restricted to the local trading UI");
    const invalidTokenDiscovery = await request(port, { path: "/api/trading/discover", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ network: "solana-mainnet", query: "PEPE" }) });
    assert.equal(invalidTokenDiscovery.status, 400, "discovery must not silently search another network");
    const shortTokenSearch = await request(port, { path: "/api/trading/discover", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ network: "base-mainnet", query: "P" }) });
    assert.equal(shortTokenSearch.status, 400, "token search requires a minimally useful query");
    const originlessActivity = await request(port, { path: "/api/trading/activity", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ network: "base-mainnet" }) });
    assert.equal(originlessActivity.status, 403, "wallet activity reads are restricted to the local trading UI");
    const invalidActivityNetwork = await request(port, { path: "/api/trading/activity", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ network: "solana-mainnet" }) });
    assert.equal(invalidActivityNetwork.status, 400, "activity route must not silently query another chain");

    const originlessWalletDecline = await request(port, { path: "/api/wallet/decline", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "not-a-real-token" }) });
    assert.equal(originlessWalletDecline.status, 403);
    const trustedWalletDecline = await request(port, { path: "/api/wallet/decline", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ token: "not-a-real-token" }) });
    assert.equal(trustedWalletDecline.status, 410);

    const watchOff = await request(port, { path: "/api/wallet/watch" });
    assert.equal(watchOff.status, 200);
    assert.equal(JSON.parse(watchOff.body).watch.enabled, false);
    const watchOn = await request(port, { path: "/api/wallet/watch", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ enabled: true }) });
    assert.equal(watchOn.status, 200);
    assert.equal(JSON.parse(watchOn.body).watch.enabled, true);
    const watchInvalid = await request(port, { path: "/api/wallet/watch", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ enabled: "false" }) });
    assert.equal(watchInvalid.status, 400, "watch preference requires an actual boolean");
    const watchOffAgain = await request(port, { path: "/api/wallet/watch", method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: JSON.stringify({ enabled: false }) });
    assert.equal(JSON.parse(watchOffAgain.body).watch.enabled, false);

    const protectedFile = await request(port, { path: "/api/file?path=.env" });
    assert.equal(protectedFile.status, 403);

    const oversizedBody = await request(port, { path: "/api/sessions", method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(2_000_001) });
    assert.equal(oversizedBody.status, 413);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  console.log("http security tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
